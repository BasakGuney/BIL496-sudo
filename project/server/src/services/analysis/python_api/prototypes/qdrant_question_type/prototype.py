import json
import re
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.models import Document, Filter, FieldCondition, MatchValue


BASE_DIR = Path(__file__).resolve().parent
SEED_PATH = BASE_DIR / "seed_examples.json"
COLLECTION_NAME = "question_type_examples"
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_NAME = "fast-paraphrase-multilingual-minilm-l12-v2"


def detect_setup_or_meta(question: str) -> bool:
    text = (question or "").strip().lower()
    if not text:
        return True

    meta_patterns = [
        r"\bmerhaba\b",
        r"\bhoş geldiniz\b",
        r"\bhazırsanız\b",
        r"\bbaşlayalım mı\b",
        r"\bbaşlayabilir miyiz\b",
        r"\bdevam edelim\b",
        r"\bbir sonraki soruya geçelim\b",
        r"\bteşekkür ederim\b",
        r"\bgörüşmek üzere\b",
        r"\bbaşka sorunuz var mı\b",
    ]
    return any(re.search(pattern, text) for pattern in meta_patterns)


def direct_rule_match(question: str):
    text = (question or "").strip().lower()

    if re.search(r"kendinizden bahsed|kendinizi tanıt", text):
        return "self_presentation"
    if re.search(r"neden bu pozisyon|neden bu rol|neden bizim şirket|neden başvurd", text):
        return "motivation"
    if re.search(r"bir durum anlat|örnek verebilir misiniz|nasıl davrand", text):
        return "behavioral"
    if re.search(r"daha önce .* proje|hangi projelerde|hangi sorumluluk", text):
        return "experience"
    if re.search(r"\bnedir\b|\bnasıl çalışır\b", text):
        return "technical_knowledge"
    if re.search(r"kullandığınız bir proje|hangi problemleri çözdünüz", text):
        return "technical_experience"
    if re.search(r"nasıl tasarlar|nasıl çözerdiniz|nasıl analiz eder", text):
        return "problem_solving"

    return None


def load_examples():
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def ensure_collection(client: QdrantClient):
    if client.collection_exists(COLLECTION_NAME):
        client.delete_collection(COLLECTION_NAME)
    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=client.get_fastembed_vector_params(),
    )


def seed_collection(client: QdrantClient, examples):
    client.upload_collection(
        collection_name=COLLECTION_NAME,
        vectors=[
            {
                VECTOR_NAME: Document(text=example["question_text"], model=EMBED_MODEL)
            }
            for example in examples
        ],
        payload=examples,
        ids=[example["id"] for example in examples],
    )


def resolve_question_type(client: QdrantClient, question: str, interview_type: str = "Technical", limit: int = 5):
    if detect_setup_or_meta(question):
        return {
            "method": "rule",
            "questionType": "meta",
            "confidence": 1.0,
            "matches": [],
        }

    direct = direct_rule_match(question)
    if direct:
        return {
            "method": "rule",
            "questionType": direct,
            "confidence": 0.95,
            "matches": [],
        }

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=Document(text=question, model=EMBED_MODEL),
        using=VECTOR_NAME,
        limit=limit,
        query_filter=Filter(
            must=[
                FieldCondition(key="language", match=MatchValue(value="tr")),
                FieldCondition(key="is_meta", match=MatchValue(value=False)),
                FieldCondition(key="interview_type", match=MatchValue(value=interview_type)),
            ]
        ),
    ).points

    if not results:
        return {
            "method": "qdrant",
            "questionType": "unknown",
            "confidence": 0.0,
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

    return {
        "method": "qdrant",
        "questionType": best_type,
        "confidence": round(confidence, 4),
        "matches": matches,
    }


def main():
    examples = load_examples()
    client = QdrantClient(path=str(BASE_DIR / ".qdrant_data"))
    client.set_model(EMBED_MODEL)
    ensure_collection(client)
    seed_collection(client, examples)

    test_questions = [
        ("Bize biraz kendinizden bahseder misiniz?", "HR"),
        ("Neden bu şirkette çalışmak istiyorsunuz?", "HR"),
        ("Bir takım çatışmasını nasıl yönettiğinizi anlatır mısınız?", "HR"),
        ("Redis nedir ve ne işe yarar?", "Technical"),
        ("Daha önce Docker kullandığınız bir projeyi anlatır mısınız?", "Technical"),
        ("Yüksek trafikli bir bildirim sistemi nasıl tasarlanır?", "Technical"),
        (
            "Çalıştığınız dönemde bir projenin hangi aşamasında NLP modelini seçtiniz? "
            "Ne gibi bir veri kullandınız ve seçim yaparken hangi kriterler önemliydi?",
            "Technical",
        ),
        ("Hazırsanız başlayalım mı?", "HR"),
    ]

    print("\nQdrant question type prototype\n")
    for question, interview_type in test_questions:
        result = resolve_question_type(client, question, interview_type=interview_type)
        print(f"Question: {question}")
        print(f"InterviewType: {interview_type}")
        print(f"Resolved: {result['questionType']} ({result['method']}, confidence={result['confidence']})")
        if result["matches"]:
            top = result["matches"][0]
            print(f"Top match: {top['questionType']} | {top['score']} | {top['question']}")
        print("-" * 72)


if __name__ == "__main__":
    main()
