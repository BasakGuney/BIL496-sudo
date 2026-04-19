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
SEED_PATH = BASE_DIR / "prototypes" / "qdrant_answer_state" / "seed_examples.json"
QDRANT_DATA_DIR = BASE_DIR / ".qdrant-answer-state"
QDRANT_URL = os.getenv("QDRANT_URL", "").strip()
COLLECTION_NAME = "answer_state_examples"
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_NAME = "fast-paraphrase-multilingual-minilm-l12-v2"
QDRANT_CONFIDENCE_THRESHOLD = 0.42
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


def _word_count(text: str) -> int:
    return len([token for token in _normalize_text(text).split(" ") if token])


def _contains_any(text: str, phrases: list[str]) -> bool:
    normalized = _normalize_text(text)
    return any(phrase in normalized for phrase in phrases)


def _detect_uncertainty(answer: str) -> bool:
    patterns = [
        "bilmiyorum",
        "emin degilim",
        "tam emin degilim",
        "hatirlamiyorum",
        "su an hatirlamiyorum",
        "net hatirlamiyorum",
        "yanlis hatirlamiyorsam",
        "tam bilmiyorum",
        "bilemedim",
        "su an bilemedim",
        "aklima bir sey gelmiyor",
        "aklima bir sey gelmedi",
        "su an aklima bir sey gelmiyor",
        "su an aklima bir sey gelmedi",
        "aklima gelmiyor",
        "aklima gelmedi",
    ]
    return _contains_any(answer, patterns)


def _is_yes_no_answer(answer: str) -> bool:
    normalized = _normalize_text(answer)
    return normalized in {"evet", "hayir", "kullandim", "kullanmadim", "oldu", "olmadi", "var", "yok"}


def _question_expects_open_narrative(question: str) -> bool:
    open_cues = [
        "anlat",
        "bahset",
        "nasil",
        "neden",
        "ornek",
        "detaylandir",
        "acikla",
        "ne yaptiniz",
        "nasil cozdunuz",
        "hangi zorluk",
    ]
    return _contains_any(question, open_cues)


def _question_expects_binary_answer(question: str) -> bool:
    normalized = _normalize_text(question)
    if _question_expects_open_narrative(normalized):
        return False

    binary_patterns = [
        r"\bvar mi\b",
        r"\bkullandiniz mi\b",
        r"\bcalistiniz mi\b",
        r"\bdenediniz mi\b",
        r"\byaptiniz mi\b",
        r"\boldu mu\b",
        r"\btecrubeniz var mi\b",
        r"\bdaha once .* mi\b",
    ]
    return any(re.search(pattern, normalized) for pattern in binary_patterns)


def _build_query_text(question: str, answer: str) -> str:
    return f"SORU: {str(question or '').strip()}\nCEVAP: {str(answer or '').strip()}"


def _direct_rule_match(question: str, answer: str, mode: str) -> dict | None:
    clean_question = str(question or "").strip()
    clean_answer = str(answer or "").strip()
    if not clean_answer:
        return {
            "answerState": "supportive_repair_candidate" if mode == "Supportive" else "followup_candidate",
            "method": "rule",
            "confidence": 0.96,
            "reason": "empty_answer",
        }

    if _detect_uncertainty(clean_answer):
        return {
            "answerState": "supportive_repair_candidate" if mode == "Supportive" else "followup_candidate",
            "method": "rule",
            "confidence": 0.98,
            "reason": "uncertainty_language",
        }

    if _is_yes_no_answer(clean_answer) and _question_expects_binary_answer(clean_question):
        return {
            "answerState": "new_topic_candidate",
            "method": "rule",
            "confidence": 0.99,
            "reason": "binary_question_yes_no_sufficient",
        }

    if _word_count(clean_answer) <= 2 and not _question_expects_binary_answer(clean_question):
        return {
            "answerState": "followup_candidate",
            "method": "rule",
            "confidence": 0.91,
            "reason": "brief_but_insufficient_for_open_question",
        }

    return None


def _infer_with_gpt(question: str, answer: str, interview_type: str, mode: str, matches: list | None = None, confidence: float = 0.0) -> dict | None:
    if not OPENAI_API_KEY:
        return None

    prompt = f"""Sen bir mulakat cevap durumu siniflandiricisisin. SADECE gecerli JSON dondur.

Interview Type: {interview_type}
Mode: {mode}

Etiketler:
- followup_candidate
- new_topic_candidate
- supportive_repair_candidate

Kurallar:
- Kisa cevap her zaman yetersiz degildir. Eger soru yes/no veya dogrulama tipi ise "evet/hayir" yeterli olabilir.
- Belirsizlik, "bilmiyorum", "emin degilim" gibi ifadeler supportive_repair_candidate olma egilimi tasir.
- Soruya ilgili ama eksik cevaplar followup_candidate olur.
- Yeterince tamamlanmis, yeni konuya gecmeye uygun cevaplar new_topic_candidate olur.
- confidence 0 ile 1 arasinda sayi olsun.

Soru:
{question}

Cevap:
{answer}

Qdrant ipucu:
confidence={round(float(confidence or 0.0), 4)}
matches={json.dumps(matches or [], ensure_ascii=False)}

JSON formatı:
{{
  "answerState": "followup_candidate",
  "confidence": 0.73,
  "reason": "Cevap ilgili ama acilmaya ihtiyac duyuyor."
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
        answer_state = str(parsed.get("answerState") or "").strip()
        if answer_state not in {"followup_candidate", "new_topic_candidate", "supportive_repair_candidate"}:
            return None
        return {
            "answerState": answer_state,
            "method": "gpt_fallback",
            "confidence": round(float(parsed.get("confidence") or 0.0), 4),
            "matches": matches or [],
            "reason": str(parsed.get("reason") or "").strip(),
        }
    except Exception:
        return None


def _build_fallback_result(question: str, answer: str, interview_type: str, mode: str, matches: list | None = None, confidence: float = 0.0) -> dict:
    gpt_result = _infer_with_gpt(question, answer, interview_type, mode, matches=matches, confidence=confidence)
    if gpt_result:
        return gpt_result
    return {
        "answerState": "supportive_repair_candidate" if mode == "Supportive" and _detect_uncertainty(answer) else "followup_candidate",
        "method": "fallback",
        "confidence": round(float(confidence or 0.0), 4),
        "matches": matches or [],
        "reason": "fallback_default",
    }


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
                {VECTOR_NAME: Document(text=_build_query_text(example["question_text"], example["answer_text"]), model=EMBED_MODEL)}
                for example in examples
            ],
            payload=examples,
            ids=[example["id"] for example in examples],
        )
    return client


def infer_answer_state(question: str, answer: str, interview_type: str = "Technical", mode: str = "Neutral", limit: int = 5) -> dict:
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

    client = _get_client()
    if client is None:
        result = _build_fallback_result(question, answer, interview_type, mode)
        result["signals"] = {
            "isYesNoAnswer": _is_yes_no_answer(answer),
            "expectsBinaryAnswer": _question_expects_binary_answer(question),
            "hasUncertainty": _detect_uncertainty(answer),
            "answerWordCount": _word_count(answer),
        }
        return result

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=Document(text=_build_query_text(question, answer), model=EMBED_MODEL),
        using=VECTOR_NAME,
        limit=limit,
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
        matches.append({
            "score": round(score, 4),
            "answerState": answer_state,
            "question": point.payload.get("question_text", ""),
            "answer": point.payload.get("answer_text", ""),
        })

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
