from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────────────
# vision_analyzer.py
#
# İki sorumluluk:
#   1. Canlı frame analizi  (--mode frame veya stdin'den {"mode":"frame",...})
#      frame_face_analyzer.py'nin eski görevi — MediaPipe/OpenCV ile yüz tespiti.
#
#   2. Oturum sonu görsel rapor yorumlama  (Python import olarak kullanılır)
#      interpret_vision_report_with_gpt() fonksiyonu — GPT destekli final raporu.
# ─────────────────────────────────────────────────────────────────────────────

import base64
import json
import os
import platform
import requests
import sys
import traceback
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

# ── OpenAI key ────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    try:
        with open("../../../../../.env", "r") as _f:
            for _line in _f:
                if _line.startswith("OPENAI_API_KEY="):
                    OPENAI_API_KEY = _line.split("=", 1)[1].strip()
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# BÖLÜM 1 — Canlı Frame Yüz Tespiti  (eski frame_face_analyzer.py)
# ══════════════════════════════════════════════════════════════════════════════

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception as exc:  # noqa: BLE001
    # Script olarak çalıştırılıyorsa hata yerine JSON döndür ve çık
    if __name__ == "__main__":
        print(json.dumps({
            "status": "unavailable",
            "message": f"Python vision dependencies unavailable: {exc}",
            "source": "unavailable",
            "faceCount": 0,
            "eyeCount": 0,
            "bbox": None,
            "faceCropBase64": "",
            "detector": {
                "requested": "mediapipe",
                "used": "unavailable",
                "mediapipeAvailable": False,
                "fallbackReason": "python_dependencies_unavailable",
                "mediapipeImportError": str(exc),
                "status": "unavailable",
            },
        }))
        raise SystemExit(0)
    cv2 = None
    np = None

MEDIAPIPE_IMPORT_ERROR = None
MEDIAPIPE_FACE_DETECTION = None
MEDIAPIPE_TASKS_BASE_OPTIONS = None
MEDIAPIPE_TASKS_FACE_DETECTOR = None
MEDIAPIPE_TASKS_FACE_DETECTOR_OPTIONS = None
MEDIAPIPE_TASKS_RUNNING_MODE = None
MEDIAPIPE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
MEDIAPIPE_MODEL_PATH = Path(__file__).resolve().parent / ".model-cache" / "blaze_face_short_range.tflite"
MEDIAPIPE_PYTHON_SUPPORTED = sys.version_info[:2] <= (3, 12)
MEDIAPIPE_PYTHON_SUPPORT_NOTE = (
    f"Python {platform.python_version()} is outside MediaPipe's published supported versions "
    "(3.9-3.12) for mediapipe 0.10.33"
)

try:
    import mediapipe as mp  # type: ignore
except Exception as exc:
    mp = None
    MEDIAPIPE_IMPORT_ERROR = str(exc)
else:
    solutions = getattr(mp, "solutions", None)
    face_detection_module = getattr(solutions, "face_detection", None) if solutions is not None else None
    face_detection_class = getattr(face_detection_module, "FaceDetection", None) if face_detection_module is not None else None
    if face_detection_class is not None:
        MEDIAPIPE_FACE_DETECTION = face_detection_class
    else:
        try:
            from mediapipe.tasks import python as mp_python  # type: ignore
            from mediapipe.tasks.python import vision as mp_vision  # type: ignore
        except Exception as exc:
            MEDIAPIPE_IMPORT_ERROR = (
                "mediapipe import succeeded but neither mp.solutions.face_detection.FaceDetection "
                f"nor mediapipe.tasks face detector APIs are available: {exc}"
            )
        else:
            MEDIAPIPE_TASKS_BASE_OPTIONS = getattr(mp_python, "BaseOptions", None)
            MEDIAPIPE_TASKS_FACE_DETECTOR = getattr(mp_vision, "FaceDetector", None)
            MEDIAPIPE_TASKS_FACE_DETECTOR_OPTIONS = getattr(mp_vision, "FaceDetectorOptions", None)
            MEDIAPIPE_TASKS_RUNNING_MODE = getattr(mp_vision, "RunningMode", None)
            if not all([
                MEDIAPIPE_TASKS_BASE_OPTIONS,
                MEDIAPIPE_TASKS_FACE_DETECTOR,
                MEDIAPIPE_TASKS_FACE_DETECTOR_OPTIONS,
                MEDIAPIPE_TASKS_RUNNING_MODE,
            ]):
                MEDIAPIPE_IMPORT_ERROR = (
                    "mediapipe import succeeded but no supported face detector API "
                    "(solutions or tasks) is available"
                )

if MEDIAPIPE_IMPORT_ERROR and not MEDIAPIPE_PYTHON_SUPPORTED:
    MEDIAPIPE_IMPORT_ERROR = f"{MEDIAPIPE_IMPORT_ERROR}. {MEDIAPIPE_PYTHON_SUPPORT_NOTE}"


# ── Frame analizi yardımcı fonksiyonlar ───────────────────────────────────────

def _load_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    return json.loads(raw or "{}")


def _decode_image(image_base64: str):
    if not image_base64:
        return None
    img_bytes = base64.b64decode(image_base64)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _encode_crop(frame, bbox):
    if frame is None or bbox is None:
        return ""
    x, y, w, h = bbox
    crop = frame[max(0, y):max(0, y) + max(0, h), max(0, x):max(0, x) + max(0, w)]
    if crop.size == 0:
        return ""
    ok, buf = cv2.imencode('.jpg', crop)
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode('ascii')


def _detect_eyes(gray_frame, bbox) -> int:
    if bbox is None:
        return 0
    x, y, w, h = bbox
    roi = gray_frame[max(0, y):max(0, y) + max(0, h), max(0, x):max(0, x) + max(0, w)]
    if roi.size == 0:
        return 0
    cascade_path = cv2.data.haarcascades + "haarcascade_eye_tree_eyeglasses.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        cascade_path = cv2.data.haarcascades + "haarcascade_eye.xml"
        detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return 0
    eyes = detector.detectMultiScale(roi, scaleFactor=1.1, minNeighbors=4, minSize=(18, 18))
    return int(min(len(eyes), 2))


def _normalize_bbox(x: float, y: float, w: float, h: float, frame_width: int, frame_height: int):
    left = max(0, min(frame_width - 1, int(round(x))))
    top = max(0, min(frame_height - 1, int(round(y))))
    width = max(0, min(frame_width - left, int(round(w))))
    height = max(0, min(frame_height - top, int(round(h))))
    if width <= 0 or height <= 0:
        return None
    return {"x": left, "y": top, "width": width, "height": height}


def _build_detector_info(*, used: str, status: str, fallback_reason: str | None = None):
    return {
        "requested": "mediapipe",
        "used": used,
        "mediapipeAvailable": MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None,
        "pythonSupportedForMediapipe": MEDIAPIPE_PYTHON_SUPPORTED,
        "fallbackReason": fallback_reason,
        "mediapipeImportError": MEDIAPIPE_IMPORT_ERROR,
        "status": status,
    }


def _ensure_mediapipe_task_model() -> Path:
    if MEDIAPIPE_MODEL_PATH.exists():
        return MEDIAPIPE_MODEL_PATH
    MEDIAPIPE_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    urlretrieve(MEDIAPIPE_MODEL_URL, MEDIAPIPE_MODEL_PATH)
    return MEDIAPIPE_MODEL_PATH


def _detect_faces_with_mediapipe_tasks(frame):
    if (
        MEDIAPIPE_TASKS_BASE_OPTIONS is None
        or MEDIAPIPE_TASKS_FACE_DETECTOR is None
        or MEDIAPIPE_TASKS_FACE_DETECTOR_OPTIONS is None
        or MEDIAPIPE_TASKS_RUNNING_MODE is None
    ):
        return None

    frame_height, frame_width = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    model_path = _ensure_mediapipe_task_model()
    options = MEDIAPIPE_TASKS_FACE_DETECTOR_OPTIONS(
        base_options=MEDIAPIPE_TASKS_BASE_OPTIONS(model_asset_path=str(model_path)),
        running_mode=MEDIAPIPE_TASKS_RUNNING_MODE.IMAGE,
    )

    with MEDIAPIPE_TASKS_FACE_DETECTOR.create_from_options(options) as detector:
        result = detector.detect(mp_image)

    detections = []
    for detection in getattr(result, "detections", []) or []:
        bbox = getattr(detection, "bounding_box", None)
        normalized = _normalize_bbox(
            getattr(bbox, "origin_x", 0),
            getattr(bbox, "origin_y", 0),
            getattr(bbox, "width", 0),
            getattr(bbox, "height", 0),
            frame_width,
            frame_height,
        ) if bbox is not None else None
        if normalized:
            detections.append(normalized)

    if not detections:
        return {"source": "mediapipe", "faceCount": 0, "bbox": None,
                "detector": _build_detector_info(used="mediapipe", status="no_face")}

    bbox = max(detections, key=lambda item: item["width"] * item["height"])
    return {"source": "mediapipe", "faceCount": len(detections), "bbox": bbox,
            "detector": _build_detector_info(used="mediapipe", status="active")}


def _detect_faces_with_mediapipe(frame):
    if MEDIAPIPE_FACE_DETECTION is not None:
        frame_height, frame_width = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detector = MEDIAPIPE_FACE_DETECTION(model_selection=0, min_detection_confidence=0.5)
        with detector:
            result = detector.process(rgb)

        detections = []
        for detection in result.detections or []:
            relative_bbox = detection.location_data.relative_bounding_box
            bbox = _normalize_bbox(
                relative_bbox.xmin * frame_width,
                relative_bbox.ymin * frame_height,
                relative_bbox.width * frame_width,
                relative_bbox.height * frame_height,
                frame_width,
                frame_height,
            )
            if bbox:
                detections.append(bbox)

        if not detections:
            return {"source": "mediapipe", "faceCount": 0, "bbox": None,
                    "detector": _build_detector_info(used="mediapipe", status="no_face")}

        bbox = max(detections, key=lambda item: item["width"] * item["height"])
        return {"source": "mediapipe", "faceCount": len(detections), "bbox": bbox,
                "detector": _build_detector_info(used="mediapipe", status="active")}

    return _detect_faces_with_mediapipe_tasks(frame)


def _detect_faces_with_opencv(gray_frame, fallback_reason: str | None = None):
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return {"source": "opencv", "error": "OpenCV Haar cascade unavailable.",
                "faceCount": 0, "bbox": None,
                "detector": _build_detector_info(used="opencv", status="unavailable", fallback_reason=fallback_reason)}

    faces = detector.detectMultiScale(gray_frame, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    face_count = int(len(faces))
    if face_count <= 0:
        return {"source": "opencv", "faceCount": 0, "bbox": None,
                "detector": _build_detector_info(used="opencv", status="no_face", fallback_reason=fallback_reason)}

    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    return {"source": "opencv", "faceCount": face_count,
            "bbox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
            "detector": _build_detector_info(used="opencv", status="active", fallback_reason=fallback_reason)}


def _run_frame_mode(payload: dict) -> None:
    """Canlı frame analizi — JSON çıktısını stdout'a yazar."""
    frame = _decode_image(str(payload.get("imageBase64", "")))
    if frame is None:
        print(json.dumps({
            "status": "invalid",
            "message": "Frame could not be decoded.",
            "source": "unavailable",
            "faceCount": 0,
            "eyeCount": 0,
            "bbox": None,
            "faceCropBase64": "",
            "detector": _build_detector_info(used="unavailable", status="invalid", fallback_reason="decode_failed"),
        }))
        return

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    detection = _detect_faces_with_mediapipe(frame)
    if detection is None:
        detection = _detect_faces_with_opencv(gray, fallback_reason="mediapipe_unavailable")
    elif detection.get("faceCount", 0) == 0:
        fallback = _detect_faces_with_opencv(gray, fallback_reason="mediapipe_no_face")
        if fallback.get("faceCount", 0) > 0:
            detection = fallback

    if detection.get("error"):
        print(json.dumps({
            "status": "unavailable",
            "message": detection["error"],
            "source": detection.get("source", "unavailable"),
            "faceCount": 0,
            "eyeCount": 0,
            "bbox": None,
            "faceCropBase64": "",
            "detector": detection.get("detector"),
        }))
        return

    bbox = detection.get("bbox")
    eye_count = 0
    if bbox is not None:
        eye_count = _detect_eyes(gray, (bbox["x"], bbox["y"], bbox["width"], bbox["height"]))

    crop_b64 = _encode_crop(frame, None if bbox is None else (bbox["x"], bbox["y"], bbox["width"], bbox["height"]))
    source = str(detection.get("source") or (
        "mediapipe" if (MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None) else "opencv"
    ))

    print(json.dumps({
        "status": "ready" if bbox else "no_face",
        "message": "Yüz algılandı." if bbox else "Yüz bulunamadı. Kameraya hizalanın.",
        "source": source,
        "detector": detection.get("detector"),
        "faceCount": int(detection.get("faceCount", 0) or 0),
        "eyeCount": eye_count,
        "bbox": bbox,
        "faceCropBase64": crop_b64,
        "imageWidth": int(frame.shape[1]),
        "imageHeight": int(frame.shape[0]),
    }))


def _run_health_mode() -> None:
    """Health-check — JSON çıktısını stdout'a yazar."""
    mp_available = MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None
    print(json.dumps({
        "status": "ready" if mp_available else "limited",
        "source": "mediapipe" if mp_available else "opencv",
        "pythonVersion": platform.python_version(),
        "opencvVersion": getattr(cv2, "__version__", "unknown"),
        "mediapipeVersion": getattr(mp, "__version__", None) if mp is not None else None,
        "detector": _build_detector_info(
            used="mediapipe" if mp_available else "opencv",
            status="active" if mp_available else "fallback",
            fallback_reason=None if mp_available else "mediapipe_unavailable",
        ),
    }))


# ══════════════════════════════════════════════════════════════════════════════
# BÖLÜM 2 — Oturum Sonu Görsel Rapor Yorumlama
# ══════════════════════════════════════════════════════════════════════════════

def compute_vision_scores(raw: dict) -> dict:
    """Deterministik 4 skor. GPT bu değerleri değiştiremez."""
    overview = raw.get("overview", {}) if isinstance(raw, dict) else {}
    tension  = raw.get("tension",  {}) if isinstance(raw, dict) else {}
    return {
        "facePresenceScore": int(overview.get("facePresenceScore", 0) or 0),
        "centeringScore":    int(overview.get("centeringScore",    0) or 0),
        "steadinessScore":   int(overview.get("steadinessScore",   0) or 0),
        "visualTensionScore":int(tension.get( "visualTensionScore", 0) or 0),
    }


def derive_vision_levels(scores: dict, raw: dict) -> dict:
    """5 yardımcı seviye etiketi — GPT'nin daha tutarlı metin yazması için."""
    fp  = scores["facePresenceScore"]
    cs  = scores["centeringScore"]
    ss  = scores["steadinessScore"]
    vt  = scores["visualTensionScore"]
    tension = raw.get("tension", {}) if isinstance(raw, dict) else {}
    ar  = int(tension.get("attentionRiskScore", 0) or 0)

    def _fp_level(v):
        if v >= 90: return "yüksek"
        if v >= 70: return "iyi"
        if v >= 40: return "orta"
        return "düşük"

    def _cs_level(v):
        if v >= 90: return "çok iyi"
        if v >= 70: return "iyi"
        if v >= 40: return "orta"
        return "zayıf"

    def _ss_level(v):
        if v >= 90: return "çok stabil"
        if v >= 70: return "stabil"
        if v >= 40: return "orta"
        return "hareketli"

    def _risk_level(v):   # attentionRiskScore
        if v <= 19: return "stabil"
        if v <= 49: return "izlenmeli"
        return "dikkat"

    def _stress_level(v): # visualTensionScore
        if v <= 19: return "düşük"
        if v <= 49: return "orta"
        return "yüksek"

    return {
        "cameraPresenceLevel": _fp_level(fp),
        "framingLevel":        _cs_level(cs),
        "stabilityLevel":      _ss_level(ss),
        "attentionLevel":      _risk_level(ar),
        "visualStressLevel":   _stress_level(vt),
    }


def build_vision_gpt_payload(raw: dict, scores: dict, levels: dict) -> dict:
    """GPT'ye gönderilecek sade, anlamlı payload."""
    overview = raw.get("overview", {}) if isinstance(raw, dict) else {}
    tension  = raw.get("tension",  {}) if isinstance(raw, dict) else {}
    diag     = raw.get("diagnostics", {}) if isinstance(raw, dict) else {}
    detector_info = diag.get("detector") or {}

    return {
        "scores": scores,
        "metrics": {
            "facePresenceRatio":   round(float(overview.get("facePresenceRatio",   0) or 0), 4),
            "averageFaceAreaRatio":round(float(overview.get("averageFaceAreaRatio", 0) or 0), 4),
            "averageCenterOffset": round(float(overview.get("averageCenterOffset",  0) or 0), 4),
            "headMovementRaw":     round(float(overview.get("headMovementRaw",      0) or 0), 4),
            "attentionRiskScore":  int(tension.get("attentionRiskScore",  0) or 0),
            "movementRiskScore":   int(tension.get("movementRiskScore",   0) or 0),
            "eyeTensionScore":     int(tension.get("eyeTensionScore",     0) or 0),
            "attentionDriftRatio": round(float(tension.get("attentionDriftRatio", 0) or 0), 4),
        },
        "levels": levels,
        "meta": {
            "detectorUsed":          str(detector_info.get("used") or "unknown"),
            "supportiveOverlayUsed": bool(raw.get("supportiveOverlayUsed", False)),
        },
    }


def generate_vision_report_with_gpt(gpt_payload: dict) -> dict | None:
    """GPT çağrısını yapar. Başarısız olursa None döner (fallback caller işler)."""
    scores = gpt_payload["scores"]

    prompt = f"""Sen bir mülakat video analiz raporu oluşturucususun.

Sana verilen veri, adayın video akışından deterministik olarak hesaplanmış görsel metriklerdir.
Bu sistem duygu analizi yapmaz, kişilik analizi yapmaz ve psikolojik teşhis üretmez.
Yalnızca kamera görünürlüğü, kadraj, merkezleme, stabilite, dikkat kayması riski ve görsel stres göstergeleri yorumlanmalıdır.

Görevin:
Verilen skorları ve yardımcı seviye etiketlerini kullanarak kullanıcı dostu, profesyonel ve tutarlı bir Türkçe rapor üretmek.

ÇOK ÖNEMLİ KURALLAR:
- Sadece verilen veriyi kullan.
- Yeni skor üretme, var olan skorları değiştirme.
- Psikolojik, kişilik veya duygu temelli yorum yapma.
- "özgüven", "kişilik", "karakter", "savunmacı", "gergin biri" gibi ifadeler kullanma.
- Çelişkili yorum yazma. Emoji kullanma.
- Kısa, net ve profesyonel bir rapor dili kullan.

SKOR YORUMLAMA KURALLARI:
Genel skorlar (facePresenceScore, centeringScore, steadinessScore):
  0–39  → düşük / belirgin iyileştirme gerektirir
  40–69 → orta / iyileştirilebilir
  70–89 → iyi / beklenen seviyede
  90–100→ yüksek / çok iyi seviyede

RİSK TİPİ SKORLAR (visualTensionScore, attentionRiskScore, movementRiskScore):
  0–19  → düşük risk / olumlu
  20–49 → orta risk / izlenmeli
  50+   → yüksek risk / dikkat gerektirir

Yorum üretirken:
- \"güçlü yön\" dili yerine \"beklenen standardı karşılıyor\", \"beklenen seviyede\", \"düşük risk\", \"izlenmesi gereken nokta\" gibi ifadeleri kullan.
- `standardStatus`: adayın görsel sunumunun beklenen koşulları sağlayıp sağlamadığını bir cümleyle özetle.
- `riskPoint`: şu anda kritik olmayan ama dikkat edilmesi gereken tek bir noktayı özetle.
- `overallLabel`: skora göre kısa rozet metni (örn. \"Görsel sunum beklenen standardı karşılıyor\").
- `overallAnalysis`: 2-3 cümle nesnel genel değerlendirme.
- `scoreDetails`: her skor için 1-2 cümlelik kısa açıklama. Mutlaka doldur.
- `strengths`: Puanlardan yola çıkarak beklenen düzeyin **üzerinde** olan 2-3 görsel sunum noktasını string listesi olarak yaz. Mutlaka doldur; boş bırakma.
- `improvementAreas`: Puanlardan yola çıkarak geliştirilmesi veya izlenmesi gereken 2-3 noktayı string listesi olarak yaz. Mutlaka doldur; boş bırakma.
- `recommendations.nextInterview`: Bir sonraki mülakatta hemen uygulanabilecek 2-3 somut kamera/sunum ipucu. Mutlaka doldur.
- `recommendations.performanceDevelopment`: Orta vadede kamera görünümünü iyileştirmek için 2-3 pratik öneri. Mutlaka doldur.

VERİLER:
{json.dumps(gpt_payload, ensure_ascii=False, indent=2)}

Skorları olduğu gibi kullan, değiştirme:
  facePresenceScore = {scores['facePresenceScore']}
  centeringScore    = {scores['centeringScore']}
  steadinessScore   = {scores['steadinessScore']}
  visualTensionScore= {scores['visualTensionScore']}

SADECE şu JSON yapısını döndür:
{{
  "overallLabel": "",
  "overallAnalysis": "",
  "standardStatus": "",
  "riskPoint": "",
  "scoreDetails": {{
    "Kamera Varlığı": "",
    "Kadraj ve Merkezleme": "",
    "Stabilite": "",
    "Görsel Stres": ""
  }},
  "strengths": ["...", "..."],
  "improvementAreas": ["...", "..."],
  "recommendations": {{
    "nextInterview": ["...", "..."],
    "performanceDevelopment": ["...", "..."]
  }}
}}"""

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output valid JSON only. No markdown, no explanation."},
            {"role": "user",   "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }

    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers, json=payload, timeout=30
    )
    response.raise_for_status()
    return json.loads(response.json()["choices"][0]["message"]["content"])


def build_final_vision_report(raw: dict, scores: dict, gpt_out: dict) -> dict:
    """Python skorları + GPT metin çıktısı → final UI JSON'u."""
    fp = scores["facePresenceScore"]
    cs = scores["centeringScore"]
    ss = scores["steadinessScore"]
    vt = scores["visualTensionScore"]

    overall_score = round(fp * 0.35 + cs * 0.25 + ss * 0.25 + (100 - vt) * 0.15)

    score_details = gpt_out.get("scoreDetails", {}) if isinstance(gpt_out.get("scoreDetails"), dict) else {}

    def _face_detail(v):
        if v >= 80: return "Yüz tüm oturum boyunca kamerada görünür durumdaydı."
        if v >= 50: return "Yüz zaman zaman kamera dışında kaldı ya da görünürlük düşüktü."
        return "Yüz büyük bölümde kamera görüş alanı dışındaydı."

    def _framing_detail(v):
        if v >= 80: return "Yüz çerçeve içinde dengeli konumlandı ve ortaya yakın seyretti."
        if v >= 50: return "Yüz merkezden kısmen saptı; kadraj iyileştirilebilir."
        return "Kadraj tutarsız; yüz çerçevenin kenarlarına yakın seyretti."

    def _stability_detail(v):
        if v >= 75: return "Baş hareketi asgari düzeyde kaldı; sakin bir görünüm sergilendi."
        if v >= 50: return "Orta düzeyde baş hareketi gözlemlendi."
        return "Baş hareketi yüksek düzeydeydi."

    def _tension_detail(v):
        if v <= 19: return "Görsel stres düşük; sakin ve kontrollü bir görünüm."
        if v <= 49: return "Orta düzeyde görsel stres saptandı."
        return "Görsel stres belirgin şekilde yüksek; dikkat kayması işaretleri gözlemlendi."

    scores_list = [
        {
            "key":    "facePresence",
            "label":  "Kamera Varlığı",
            "score":  fp,
            "detail": score_details.get("Kamera Varlığı") or _face_detail(fp),
        },
        {
            "key":    "framing",
            "label":  "Kadraj ve Merkezleme",
            "score":  cs,
            "detail": score_details.get("Kadraj ve Merkezleme") or _framing_detail(cs),
        },
        {
            "key":    "steadiness",
            "label":  "Stabilite",
            "score":  ss,
            "detail": score_details.get("Stabilite") or _stability_detail(ss),
        },
        {
            "key":    "visualTension",
            "label":  "Görsel Stres",
            "score":  vt,
            "detail": score_details.get("Görsel Stres") or _tension_detail(vt),
        },
    ]

    recs_raw = gpt_out.get("recommendations") or {}
    if isinstance(recs_raw, list):
        # Eski format uyumluluğu: liste halinde geldiyse dönüştür
        recs = {
            "nextInterview":        [r.get("text", r.get("title", str(r))) for r in recs_raw[:2]],
            "performanceDevelopment": [r.get("text", str(r)) for r in recs_raw[2:]],
        }
    else:
        ni  = recs_raw.get("nextInterview", [])
        pd_ = recs_raw.get("performanceDevelopment", [])
        recs = {
            "nextInterview":         ni  if isinstance(ni,  list) else [ni],
            "performanceDevelopment":pd_ if isinstance(pd_, list) else [pd_],
        }

    def _safe_list(v):
        return v if isinstance(v, list) else []

    return {
        "overallScore":    overall_score,
        "overallLabel":    str(gpt_out.get("overallLabel")    or "Görsel sunum değerlendirildi."),
        "overallAnalysis": str(gpt_out.get("overallAnalysis") or ""),
        "standardStatus":  str(gpt_out.get("standardStatus")  or ""),
        "riskPoint":       str(gpt_out.get("riskPoint")        or ""),
        "scores":          scores_list,
        "strengths":       _safe_list(gpt_out.get("strengths")),
        "improvementAreas":_safe_list(gpt_out.get("improvementAreas")),
        "recommendations": recs,
    }


def _build_fallback_vision_report(raw: dict, scores: dict, error: str) -> dict:
    """GPT başarısız olursa deterministik fallback."""
    fp = scores["facePresenceScore"]
    cs = scores["centeringScore"]
    ss = scores["steadinessScore"]
    vt = scores["visualTensionScore"]
    overall_score = round(fp * 0.35 + cs * 0.25 + ss * 0.25 + (100 - vt) * 0.15)

    def _face_d(v):
        if v >= 80: return "Yüz tüm oturum boyunca kamerada görünür durumdaydı."
        if v >= 50: return "Yüz zaman zaman kamera dışında kaldı ya da görünürlük düşüktü."
        return "Yüz büyük bölümde kamera görüş alanı dışındaydı."
    def _frame_d(v):
        if v >= 80: return "Yüz çerçeve içinde dengeli konumlandı."
        if v >= 50: return "Yüz merkezden kısmen saptı; kadraj iyileştirilebilir."
        return "Kadraj tutarsız; yüz çerçevenin kenarlarına yakın seyretti."
    def _stab_d(v):
        if v >= 75: return "Baş hareketi asgari düzeyde kaldı."
        if v >= 50: return "Orta düzeyde baş hareketi gözlemlendi."
        return "Baş hareketi yüksek düzeydeydi."
    def _tens_d(v):
        if v <= 19: return "Görsel stres düşük; sakin ve kontrollü bir görünüm."
        if v <= 49: return "Orta düzeyde görsel stres saptandı."
        return "Görsel stres belirgin şekilde yüksek."

    return {
        "overallScore":    overall_score,
        "overallLabel":    "Görsel analiz tamamlandı (GPT yorumu alınamadı).",
        "overallAnalysis": "Görsel metrikler başarıyla hesaplandı. GPT yorum servisi yanıt vermedi.",
        "standardStatus":  "Metrikler hesaplandı; metin yorumu üretilemedi.",
        "riskPoint":       f"GPT bağlantı hatası: {error}",
        "scores": [
            {"key": "facePresence",  "label": "Kamera Varlığı",       "score": fp, "detail": _face_d(fp)},
            {"key": "framing",       "label": "Kadraj ve Merkezleme",  "score": cs, "detail": _frame_d(cs)},
            {"key": "steadiness",    "label": "Stabilite",             "score": ss, "detail": _stab_d(ss)},
            {"key": "visualTension", "label": "Görsel Stres",          "score": vt, "detail": _tens_d(vt)},
        ],
        "strengths":        [],
        "improvementAreas": [],
        "recommendations":  {"nextInterview": [], "performanceDevelopment": []},
    }


def interpret_vision_report_with_gpt(vision_analysis: dict) -> dict:
    """
    Geriye uyumlu public API — api.py bu fonksiyonu çağırır.
    İçeride yeni 5-fonksiyon pipeline'ını çalıştırır.
    """
    if not isinstance(vision_analysis, dict):
        vision_analysis = {}

    scores  = compute_vision_scores(vision_analysis)
    levels  = derive_vision_levels(scores, vision_analysis)
    payload = build_vision_gpt_payload(vision_analysis, scores, levels)

    try:
        gpt_out = generate_vision_report_with_gpt(payload)
        if not isinstance(gpt_out, dict):
            raise ValueError("GPT returned non-dict")
        return build_final_vision_report(vision_analysis, scores, gpt_out)
    except Exception as e:
        print(f"GPT Vision Report Error: {e}")
        return _build_fallback_vision_report(vision_analysis, scores, str(e))




# ══════════════════════════════════════════════════════════════════════════════
# Script girişi — sadece frame / health modlarında kullanılır
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    payload = _load_payload()
    mode = str(payload.get("mode") or "").lower()

    if mode == "health":
        _run_health_mode()
    else:
        # default: frame analizi
        _run_frame_mode(payload)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({
            "status": "unavailable",
            "message": f"Vision analyzer runtime error: {exc}",
            "source": "unavailable",
            "faceCount": 0,
            "eyeCount": 0,
            "bbox": None,
            "faceCropBase64": "",
            "detector": _build_detector_info(
                used="unavailable",
                status="runtime_error",
                fallback_reason="python_runtime_exception",
            ),
            "traceback": traceback.format_exc(),
        }))
