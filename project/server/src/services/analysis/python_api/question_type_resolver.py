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
        r"\bherhangi bir sorunuz var mi\b",
        r"\bsormak istediginiz bir sey var mi\b",
        r"\bsormak istediginiz bir soru var mi\b",
        r"\bakliniza takilan herhangi bir sey var mi\b",
        r"\bakliniza takilan bir sey var mi\b",
        r"\bakliniza takilan herhangi bir soru var mi\b",
        r"\bakliniza takilan bir soru var mi\b",
        r"\bbaslamadan once akliniza takilan\b",
    ]
    return any(re.search(pattern, text) for pattern in meta_patterns)


def direct_rule_match(question: str, interview_type: str = "Technical"):
    text = _normalize_text(question)

    if re.search(
        r"bahsettiginiz o staj|bahsettiginiz staj|bir tanesi uzerinde biraz daha dur|"
        r"bir tanesi üzerinde biraz daha dur|o deneyimlerden birini anlat|"
        r"en cok neyi faydali buldunuz|en çok neyi faydalı buldunuz|"
        r"hangi stajinizdan bahsetmek istersiniz|hangi stajınızdan bahsetmek istersiniz",
        text,
    ):
        return "experience"
    if re.search(r"kendinizden bahsed|kendinizi tanit|sizi biraz tanimak istiyorum", text):
        return "self_presentation"
    if re.search(r"neden bu pozisyon|neden bu rol|neden bizim sirket|neden basvurd|motivasyon", text):
        return "motivation"
    if interview_type == "HR" and re.search(
        r"ornek verebilir misiniz|nasil davrand|nasil yonettiniz|nasil yönettiniz|"
        r"hangi adimlari attiniz|hangi adımları attınız|bireysel katkiniz neydi|bireysel katkınız neydi|"
        r"catisma|çatışma|baski altinda|baskı altında|zor durum|zorlandiginiz|zorlandığınız|"
        r"sonuc ne oldu|ölculebilir bir etki|ölçülebilir bir etki|iletisim kurdunuz|iletişim kurdunuz|"
        r"araci oldunuz|aracı oldunuz|ne farklilasti|ne farklılaştı",
        text
    ):
        return "behavioral"
    if re.search(
        r"hangi araclari kullandiniz|hangi teknolojileri kullandiniz|hangi metri|dogruluk orani|olculebilir etki|"
        r"pipeline|performansini olcmek|performansini ölçmek|verimliligi nasil etkilendi|verimliliği nasıl etkilendi|"
        r"nasil bir donusum saglandi|nasil bir dönüşüm sağlandi|hangi adimlari izlediniz ve sonuc|"
        r"hangi adimlari izlediniz ve nasil bir cozum|hangi adımları izlediniz ve nasıl bir çözüm|"
        r"ne tur bir donusum saglandi|ne tür bir dönüşüm sağlandı|zaman tasarrufu|hangi sonucu elde edildi|"
        r"hangi sonucu elde ettiniz|dogruluk gibi bir sonuc|doğruluk gibi bir sonuç",
        text
    ):
        return "technical_experience"
    if re.search(r"bir durum anlat|ornek verebilir misiniz|nasil davrand|en buyuk zorluk|nasil astiniz", text):
        return "behavioral"
    if re.search(r"kullandiginiz bir proje|hangi problemleri cozdunuz|hangi teknolojileri kullandiniz|nlp modelini sectiniz", text):
        return "technical_experience"
    if re.search(r"nasil tasarlar|nasil cozerdiniz|nasil analiz eder|nasil saglarsiniz|yaklasirdiniz", text):
        return "problem_solving"
    if re.search(r"\bnedir\b|\bnasil calisir\b|arasindaki fark nedir", text):
        return "technical_knowledge"
    if re.search(r"daha once .* proje|hangi projelerde|hangi sorumluluk|hangi rolde|hangi gorevleri", text):
        return "experience"

    return None


@lru_cache(maxsize=1)
def _load_examples():
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _get_client():
    if QdrantClient is None or Document is None:
        return None

    client = QdrantClient(path=str(QDRANT_DATA_DIR))
    client.set_model(EMBED_MODEL)
    examples = _load_examples()

    if client.collection_exists(COLLECTION_NAME):
        client.delete_collection(COLLECTION_NAME)
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
