import argparse
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import Document, Filter, FieldCondition, MatchValue

PYTHON_API_DIR = Path(__file__).resolve().parents[2]
if str(PYTHON_API_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_API_DIR))

from question_type_resolver import (
    COLLECTION_NAME,
    EMBED_MODEL,
    QDRANT_CONFIDENCE_THRESHOLD,
    SEED_PATH,
    VECTOR_NAME,
    _build_fallback_result,
    _normalize_text,
    detect_setup_or_meta,
    direct_rule_match,
)


BASE_DIR = Path(__file__).resolve().parent
EVAL_PATH = BASE_DIR / "eval_examples.json"
LOCAL_QDRANT_DIR = BASE_DIR / ".qdrant_eval_data"
DEFAULT_CONFUSION_MATRIX_PATH = BASE_DIR / "question_type_confusion_matrix.png"
LABELS = [
    "self_presentation",
    "motivation",
    "behavioral",
    "experience",
    "technical_knowledge",
    "technical_experience",
    "problem_solving",
]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate Qdrant question type classifier.")
    parser.add_argument(
        "--eval-path",
        type=Path,
        default=EVAL_PATH,
        help="Path to the evaluation dataset JSON file.",
    )
    parser.add_argument(
        "--confusion-matrix-path",
        type=Path,
        default=None,
        help="Optional PNG output path for the confusion matrix image.",
    )
    return parser.parse_args()


def prepare_client():
    if LOCAL_QDRANT_DIR.exists():
        for item in sorted(LOCAL_QDRANT_DIR.rglob("*"), reverse=True):
            if item.is_file():
                item.unlink()
            else:
                item.rmdir()

    client = QdrantClient(path=str(LOCAL_QDRANT_DIR))
    client.set_model(EMBED_MODEL)
    examples = load_json(SEED_PATH)

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=client.get_fastembed_vector_params(),
    )
    client.upload_collection(
        collection_name=COLLECTION_NAME,
        vectors=[
            {VECTOR_NAME: Document(text=example["question_text"], model=EMBED_MODEL)}
            for example in examples
        ],
        payload=examples,
        ids=[example["id"] for example in examples],
    )
    return client


def infer_with_local_qdrant(client: QdrantClient, question: str, interview_type: str):
    if detect_setup_or_meta(question):
        return {
            "questionType": "meta",
            "method": "rule",
            "confidence": 1.0,
            "matches": [],
        }

    direct = direct_rule_match(question, interview_type)
    if direct:
        return {
            "questionType": direct,
            "method": "rule",
            "confidence": 0.95,
            "matches": [],
        }

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=Document(text=question, model=EMBED_MODEL),
        using=VECTOR_NAME,
        limit=5,
        query_filter=Filter(
            must=[
                FieldCondition(key="language", match=MatchValue(value="tr")),
                FieldCondition(key="is_meta", match=MatchValue(value=False)),
                FieldCondition(key="interview_type", match=MatchValue(value=interview_type)),
            ]
        ),
    ).points

    if not results:
        return _build_fallback_result(question, interview_type)

    normalized_question = _normalize_text(question)
    top_point = results[0]
    top_question = str(top_point.payload.get("question_text", "") or "")

    if _normalize_text(top_question) == normalized_question:
        return {
            "questionType": top_point.payload.get("question_type", "unknown"),
            "method": "qdrant_exact",
            "confidence": 1.0,
            "matches": [],
        }

    weighted = {}
    matches = []
    for point in results:
        q_type = point.payload.get("question_type", "unknown")
        score = float(point.score or 0.0)
        weighted[q_type] = weighted.get(q_type, 0.0) + score
        matches.append(
            {
                "score": round(score, 4),
                "questionType": q_type,
                "question": point.payload.get("question_text", ""),
            }
        )

    best_type = max(weighted.items(), key=lambda item: item[1])[0]
    total = sum(weighted.values()) or 1.0
    confidence = weighted[best_type] / total

    if confidence < QDRANT_CONFIDENCE_THRESHOLD:
        return _build_fallback_result(question, interview_type, matches=matches, confidence=confidence)

    return {
        "questionType": best_type,
        "method": "qdrant",
        "confidence": round(confidence, 4),
        "matches": matches,
    }


def build_confusion_matrix(rows):
    matrix = {actual: {pred: 0 for pred in LABELS} for actual in LABELS}
    for row in rows:
        matrix[row["expected"]][row["predicted"]] += 1
    return matrix


def print_confusion_matrix(matrix):
    print("\nConfusion Matrix (rows=expected, cols=predicted)\n")
    header = ["expected\\pred"] + LABELS
    col_width = max(len(item) for item in header) + 2
    print("".join(item.ljust(col_width) for item in header))
    for actual in LABELS:
        row = [actual] + [str(matrix[actual][pred]) for pred in LABELS]
        print("".join(item.ljust(col_width) for item in row))


def save_confusion_matrix_plot(matrix, output_path: Path):
    values = np.array([[matrix[actual][pred] for pred in LABELS] for actual in LABELS], dtype=int)
    fig, ax = plt.subplots(figsize=(12, 9))
    im = ax.imshow(values, cmap="YlGnBu")

    ax.set_xticks(np.arange(len(LABELS)))
    ax.set_yticks(np.arange(len(LABELS)))
    ax.set_xticklabels(LABELS, rotation=30, ha="right")
    ax.set_yticklabels(LABELS)
    ax.set_xlabel("Predicted label")
    ax.set_ylabel("Actual label")
    ax.set_title("Qdrant Question Type Confusion Matrix")

    for row_idx in range(values.shape[0]):
        for col_idx in range(values.shape[1]):
            value = values[row_idx, col_idx]
            color = "white" if value >= values.max() * 0.45 else "black"
            ax.text(col_idx, row_idx, str(value), ha="center", va="center", color=color, fontsize=11)

    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="Example count")
    fig.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def main():
    args = parse_args()
    eval_path = args.eval_path
    confusion_matrix_path = args.confusion_matrix_path or eval_path.with_name(f"{eval_path.stem}_confusion_matrix.png")

    client = prepare_client()
    eval_examples = load_json(eval_path)
    rows = []

    for example in eval_examples:
        result = infer_with_local_qdrant(client, example["question_text"], example["interview_type"])
        rows.append(
            {
                "id": example["id"],
                "question": example["question_text"],
                "expected": example["question_type"],
                "predicted": result["questionType"],
                "method": result["method"],
                "confidence": result["confidence"],
                "correct": result["questionType"] == example["question_type"],
            }
        )

    matrix = build_confusion_matrix(rows)
    correct = sum(1 for row in rows if row["correct"])
    accuracy = correct / len(rows)
    by_label = {}
    for label in LABELS:
        label_rows = [row for row in rows if row["expected"] == label]
        label_correct = sum(1 for row in label_rows if row["correct"])
        by_label[label] = round(label_correct / len(label_rows), 4)

    methods = {}
    for row in rows:
        methods[row["method"]] = methods.get(row["method"], 0) + 1

    print(f"Total examples: {len(rows)}")
    print(f"Correct: {correct}")
    print(f"Accuracy: {accuracy:.4f}")
    print(f"Method breakdown: {json.dumps(methods, ensure_ascii=False)}")
    print(f"Per-label accuracy: {json.dumps(by_label, ensure_ascii=False)}")

    print_confusion_matrix(matrix)
    save_confusion_matrix_plot(matrix, confusion_matrix_path)
    print(f"\nConfusion matrix image saved to: {confusion_matrix_path}")

    wrong = [row for row in rows if not row["correct"]]
    if wrong:
        print("\nMisclassified Examples\n")
        for row in wrong[:20]:
            print(
                f"[{row['id']}] expected={row['expected']} predicted={row['predicted']} "
                f"method={row['method']} confidence={row['confidence']}"
            )
            print(f"  Q: {row['question']}")


if __name__ == "__main__":
    main()
