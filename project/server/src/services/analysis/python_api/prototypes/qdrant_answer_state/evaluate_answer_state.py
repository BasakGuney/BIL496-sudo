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

from answer_state_resolver import (  # noqa: E402
    COLLECTION_NAME,
    EMBED_MODEL,
    QDRANT_CONFIDENCE_THRESHOLD,
    SEED_PATH,
    VECTOR_NAME,
    _build_fallback_result,
    _build_query_text,
    _detect_uncertainty,
    _direct_rule_match,
    _is_yes_no_answer,
    _question_expects_binary_answer,
    _word_count,
)


BASE_DIR = Path(__file__).resolve().parent
EVAL_PATH = BASE_DIR / "eval_examples.json"
LOCAL_QDRANT_DIR = BASE_DIR / ".qdrant_eval_data"
LABELS = [
    "followup_candidate",
    "new_topic_candidate",
    "supportive_repair_candidate",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate Qdrant answer state classifier.")
    parser.add_argument("--eval-path", type=Path, default=EVAL_PATH, help="Path to evaluation JSON file.")
    parser.add_argument(
        "--confusion-matrix-path",
        type=Path,
        default=None,
        help="Optional PNG output path for confusion matrix image.",
    )
    return parser.parse_args()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


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
            {VECTOR_NAME: Document(text=_build_query_text(example["question_text"], example["answer_text"]), model=EMBED_MODEL)}
            for example in examples
        ],
        payload=examples,
        ids=[example["id"] for example in examples],
    )
    return client


def infer_with_local_qdrant(client: QdrantClient, question: str, answer: str, interview_type: str, mode: str):
    rule_match = _direct_rule_match(question, answer, mode)
    if rule_match:
        return {
            **rule_match,
            "signals": {
                "isYesNoAnswer": _is_yes_no_answer(answer),
                "expectsBinaryAnswer": _question_expects_binary_answer(question),
                "hasUncertainty": _detect_uncertainty(answer),
                "answerWordCount": _word_count(answer),
            },
        }

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=Document(text=_build_query_text(question, answer), model=EMBED_MODEL),
        using=VECTOR_NAME,
        limit=5,
        query_filter=Filter(
            must=[
                FieldCondition(key="language", match=MatchValue(value="tr")),
                FieldCondition(key="interview_type", match=MatchValue(value=interview_type)),
            ]
        ),
    ).points

    if not results:
        result = _build_fallback_result(question, answer, interview_type, mode)
        result["signals"] = {
            "isYesNoAnswer": _is_yes_no_answer(answer),
            "expectsBinaryAnswer": _question_expects_binary_answer(question),
            "hasUncertainty": _detect_uncertainty(answer),
            "answerWordCount": _word_count(answer),
        }
        return result

    weighted = {}
    matches = []
    for point in results:
        answer_state = point.payload.get("answer_state", "followup_candidate")
        score = float(point.score or 0.0)
        weighted[answer_state] = weighted.get(answer_state, 0.0) + score
        matches.append(
            {
                "score": round(score, 4),
                "answerState": answer_state,
                "question": point.payload.get("question_text", ""),
                "answer": point.payload.get("answer_text", ""),
            }
        )

    best_state = max(weighted.items(), key=lambda item: item[1])[0]
    total = sum(weighted.values()) or 1.0
    confidence = weighted[best_state] / total

    if confidence < QDRANT_CONFIDENCE_THRESHOLD:
        result = _build_fallback_result(question, answer, interview_type, mode, matches=matches, confidence=confidence)
    else:
        result = {
            "answerState": best_state,
            "method": "qdrant",
            "confidence": round(confidence, 4),
            "matches": matches,
        }

    result["signals"] = {
        "isYesNoAnswer": _is_yes_no_answer(answer),
        "expectsBinaryAnswer": _question_expects_binary_answer(question),
        "hasUncertainty": _detect_uncertainty(answer),
        "answerWordCount": _word_count(answer),
    }
    return result


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
    fig, ax = plt.subplots(figsize=(9, 7))
    im = ax.imshow(values, cmap="YlGnBu")

    ax.set_xticks(np.arange(len(LABELS)))
    ax.set_yticks(np.arange(len(LABELS)))
    ax.set_xticklabels(LABELS, rotation=20, ha="right")
    ax.set_yticklabels(LABELS)
    ax.set_xlabel("Predicted label")
    ax.set_ylabel("Actual label")
    ax.set_title("Qdrant Answer State Confusion Matrix")

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
        result = infer_with_local_qdrant(
            client,
            example["question_text"],
            example["answer_text"],
            example["interview_type"],
            example.get("mode", "Neutral"),
        )
        rows.append(
            {
                "id": example["id"],
                "question": example["question_text"],
                "answer": example["answer_text"],
                "expected": example["answer_state"],
                "predicted": result["answerState"],
                "method": result["method"],
                "confidence": result["confidence"],
                "correct": result["answerState"] == example["answer_state"],
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
            print(f"  A: {row['answer']}")


if __name__ == "__main__":
    main()
