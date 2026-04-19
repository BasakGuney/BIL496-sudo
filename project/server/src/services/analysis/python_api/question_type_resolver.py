import json
import os
import re
from functools import lru_cache
from pathlib import Path
import requests

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Document, Filter, FieldCondition, MatchValue
except Exception:  # pragma: no cover - optional dependency
    QdrantClient = None
    Document = None
    Filter = None
    FieldCondition = None
    MatchValue = None


BASE_DIR = Path(__file__).resolve().parent
SEED_PATH = BASE_DIR / "prototypes" / "qdrant_question_type" / "seed_examples.json"
QDRANT_DATA_DIR = BASE_DIR / ".qdrant-question-type"
QDRANT_URL = os.getenv("QDRANT_URL", "").strip()
COLLECTION_NAME = "question_type_examples"
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_NAME = "fast-paraphrase-multilingual-minilm-l12-v2"
QDRANT_CONFIDENCE_THRESHOLD = 0.36
QUESTION_TYPE_DEBUG = os.getenv("QUESTION_TYPE_DEBUG", "1").strip().lower() not in {"0", "false", "no", "off"}
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    try:
        with open(BASE_DIR.parents[4] / ".env", "r", encoding="utf-8") as env_file:
            for line in env_file:
                if line.startswith("OPENAI_API_KEY="):
                    OPENAI_API_KEY = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass


def _normalize_text(text: str) -> str:
    value = str(text or "").strip().lower()
    replacements = {
        "ç": "c",
        "ğ": "g",
        "ı": "i",
        "ö": "o",
        "ş": "s",
        "ü": "u",
        "â": "a",
        "î": "i",
        "û": "u",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    value = re.sub(r"\s+", " ", value)
    return value


def _log_question_type_decision(question: str, result: dict) -> None:
    if not QUESTION_TYPE_DEBUG:
        return

    question_text = str(question or "").strip().replace("\n", " ")
    method = str(result.get("method") or "unknown")
    question_type = str(result.get("questionType") or "unknown")
    confidence = result.get("confidence", 0.0)
    matches = result.get("matches") or []

    print(
        f"[QuestionTypeResolver] method={method} "
        f"type={question_type} confidence={confidence} "
        f'question="{question_text}"'
    )
    for index, match in enumerate(matches[:3], start=1):
        print(
            f"[QuestionTypeResolver] match{index}: "
            f"type={match.get('questionType')} "
            f"score={match.get('score')} "
            f'question="{str(match.get("question") or "").strip()}"'
        )


def _default_fallback_type(interview_type: str) -> str:
    return "experience" if interview_type != "Technical" else "technical_experience"


def _infer_question_type_with_gpt(question: str, interview_type: str, matches: list | None = None, confidence: float = 0.0) -> dict | None:
    if not OPENAI_API_KEY:
        return None

    prompt = f"""Sen bir mülakat soru tipi sınıflandırıcısısın. SADECE geçerli JSON nesnesi döndür.

Interview Type: {interview_type}

Soru tipi seçenekleri:
- self_presentation
- motivation
- behavioral
- experience
- technical_knowledge
- technical_experience
- problem_solving
- meta

Kurallar:
- HR görüşmelerinde davranış, çatışma, geri bildirim, ekip içi iletişim, belirsizlik yönetimi gibi sorular çoğunlukla behavioral olur.
- HR görüşmelerinde staj/proje üzerinden gidilse bile teknik detay değil, adayın yaşadığı deneyim soruluyorsa experience veya behavioral seç.
- Teknik görüşmelerde teknoloji, model, metrik, araç, mimari, sistem tasarımı veya teknik kararlar soruluyorsa technical_experience / technical_knowledge / problem_solving seçeneklerinden uygun olanı seç.
- Açılış, kapanış, selamlama, "sorunuz var mı" gibi akış soruları meta olur.
- confidence 0 ile 1 arasında bir sayı olsun.
- reason en fazla 1 kısa cümle olsun.

Soru:
{question}

Qdrant ipucu:
confidence={round(float(confidence or 0.0), 4)}
matches={json.dumps(matches or [], ensure_ascii=False)}

JSON formatı:
{{
  "questionType": "behavioral",
  "confidence": 0.72,
  "reason": "Soru davranışsal bir örnek ve adayın yaklaşımını istiyor."
}}
"""

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output JSON only."},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0,
    }

    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        parsed = json.loads(data["choices"][0]["message"]["content"])
        question_type = str(parsed.get("questionType") or "").strip()
        valid_types = {
            "self_presentation",
            "motivation",
            "behavioral",
            "experience",
            "technical_knowledge",
            "technical_experience",
            "problem_solving",
            "meta",
        }
        if question_type not in valid_types:
            return None
        return {
            "questionType": question_type,
            "method": "gpt_fallback",
            "confidence": round(float(parsed.get("confidence") or 0.0), 4),
            "matches": matches or [],
            "reason": str(parsed.get("reason") or "").strip(),
        }
    except Exception:
        return None


def _build_fallback_result(question: str, interview_type: str, matches: list | None = None, confidence: float = 0.0) -> dict:
    gpt_result = _infer_question_type_with_gpt(question, interview_type, matches=matches, confidence=confidence)
    if gpt_result:
        _log_question_type_decision(question, gpt_result)
        return gpt_result

    result = {
        "questionType": _default_fallback_type(interview_type),
        "method": "fallback",
        "confidence": round(float(confidence or 0.0), 4),
        "matches": matches or [],
    }
    _log_question_type_decision(question, result)
    return result


def detect_setup_or_meta(question: str) -> bool:
    text = _normalize_text(question)
    if not text:
        return True

    meta_patterns = [
        r"\bmerhaba\b",
        r"\bhos geldiniz\b",
        r"\bhazirsaniz\b",
        r"\bbaslayalim mi\b",
        r"\bbaslayabilir miyiz\b",
        r"\bdevam edelim\b",
        r"\bbir sonraki soruya gecelim\b",
        r"\btesekkur ederim\b",
        r"\bgorusmek uzere\b",
        r"\bbaska sorunuz var mi\b",
        r"\bbaska bir sorunuz var mi\b",
        r"\bherhangi bir sorunuz var mi\b",
        r"\bsormak istediginiz bir sey var mi\b",
        r"\bsormak istediginiz bir soru var mi\b",
        r"\bbaska eklemek istediginiz bir sey var mi\b",
        r"\beklemek istediginiz bir sey var mi\b",
        r"\bbu soru ve yanitlarimizla ilgili baska eklemek istediginiz\b",
        r"\bakliniza takilan herhangi bir sey var mi\b",
        r"\bakliniza takilan bir sey var mi\b",
        r"\bakliniza takilan herhangi bir soru var mi\b",
        r"\bakliniza takilan bir soru var mi\b",
        r"\bbaslamadan once akliniza takilan\b",
    ]
    return any(re.search(pattern, text) for pattern in meta_patterns)


def direct_rule_match(question: str, interview_type: str = "Technical"):
    _ = question
    _ = interview_type
    return None


@lru_cache(maxsize=1)
def _load_examples():
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _get_client():
    if QdrantClient is None or Document is None:
        return None

    if QDRANT_URL:
        client = QdrantClient(url=QDRANT_URL)
    else:
        client = QdrantClient(path=str(QDRANT_DATA_DIR))
    client.set_model(EMBED_MODEL)
    examples = _load_examples()

    if not client.collection_exists(COLLECTION_NAME):
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


def infer_question_type(question: str, interview_type: str = "Technical", limit: int = 5) -> dict:
    if detect_setup_or_meta(question):
        result = {
            "questionType": "meta",
            "method": "rule",
            "confidence": 1.0,
            "matches": [],
        }
        _log_question_type_decision(question, result)
        return result

    direct = direct_rule_match(question, interview_type)
    if direct:
        result = {
            "questionType": direct,
            "method": "rule",
            "confidence": 0.95,
            "matches": [],
        }
        _log_question_type_decision(question, result)
        return result

    client = _get_client()
    if client is None:
        return _build_fallback_result(question, interview_type)

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
        return _build_fallback_result(question, interview_type)

    normalized_question = _normalize_text(question)
    top_point = results[0]
    top_question = str(top_point.payload.get("question_text", "") or "")
    if _normalize_text(top_question) == normalized_question:
        result = {
            "questionType": top_point.payload.get("question_type", "unknown"),
            "method": "qdrant_exact",
            "confidence": 1.0,
            "matches": [
                {
                    "score": round(float(point.score or 0.0), 4),
                    "questionType": point.payload.get("question_type", "unknown"),
                    "question": point.payload.get("question_text", ""),
                }
                for point in results
            ],
        }
        _log_question_type_decision(question, result)
        return result

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

    result = {
        "questionType": best_type,
        "method": "qdrant",
        "confidence": round(confidence, 4),
        "matches": matches,
    }
    _log_question_type_decision(question, result)
    return result
