from __future__ import annotations

import base64
import json
import platform
import traceback
import sys
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception as exc:  # noqa: BLE001
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


def load_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    return json.loads(raw or "{}")


def decode_image(image_base64: str):
    if not image_base64:
        return None
    img_bytes = base64.b64decode(image_base64)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def encode_crop(frame, bbox):
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


def detect_eyes(gray_frame, bbox) -> int:
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


def normalize_bbox(x: float, y: float, w: float, h: float, frame_width: int, frame_height: int):
    left = max(0, min(frame_width - 1, int(round(x))))
    top = max(0, min(frame_height - 1, int(round(y))))
    width = max(0, min(frame_width - left, int(round(w))))
    height = max(0, min(frame_height - top, int(round(h))))
    if width <= 0 or height <= 0:
        return None
    return {"x": left, "y": top, "width": width, "height": height}


def build_detector_info(*, used: str, status: str, fallback_reason: str | None = None):
    return {
        "requested": "mediapipe",
        "used": used,
        "mediapipeAvailable": MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None,
        "pythonSupportedForMediapipe": MEDIAPIPE_PYTHON_SUPPORTED,
        "fallbackReason": fallback_reason,
        "mediapipeImportError": MEDIAPIPE_IMPORT_ERROR,
        "status": status,
    }


def ensure_mediapipe_task_model() -> Path:
    if MEDIAPIPE_MODEL_PATH.exists():
        return MEDIAPIPE_MODEL_PATH
    MEDIAPIPE_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    urlretrieve(MEDIAPIPE_MODEL_URL, MEDIAPIPE_MODEL_PATH)
    return MEDIAPIPE_MODEL_PATH


def detect_faces_with_mediapipe_tasks(frame):
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
    model_path = ensure_mediapipe_task_model()
    options = MEDIAPIPE_TASKS_FACE_DETECTOR_OPTIONS(
        base_options=MEDIAPIPE_TASKS_BASE_OPTIONS(model_asset_path=str(model_path)),
        running_mode=MEDIAPIPE_TASKS_RUNNING_MODE.IMAGE,
    )

    with MEDIAPIPE_TASKS_FACE_DETECTOR.create_from_options(options) as detector:
        result = detector.detect(mp_image)

    detections = []
    for detection in getattr(result, "detections", []) or []:
        bbox = getattr(detection, "bounding_box", None)
        normalized = normalize_bbox(
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
        return {
            "source": "mediapipe",
            "faceCount": 0,
            "bbox": None,
            "detector": build_detector_info(used="mediapipe", status="no_face"),
        }

    bbox = max(detections, key=lambda item: item["width"] * item["height"])
    return {
        "source": "mediapipe",
        "faceCount": len(detections),
        "bbox": bbox,
        "detector": build_detector_info(used="mediapipe", status="active"),
    }


def detect_faces_with_mediapipe(frame):
    if MEDIAPIPE_FACE_DETECTION is not None:
        frame_height, frame_width = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detector = MEDIAPIPE_FACE_DETECTION(
            model_selection=0,
            min_detection_confidence=0.5,
        )
        with detector:
            result = detector.process(rgb)

        detections = []
        for detection in result.detections or []:
            relative_bbox = detection.location_data.relative_bounding_box
            bbox = normalize_bbox(
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
            return {
                "source": "mediapipe",
                "faceCount": 0,
                "bbox": None,
                "detector": build_detector_info(used="mediapipe", status="no_face"),
            }

        bbox = max(detections, key=lambda item: item["width"] * item["height"])
        return {
            "source": "mediapipe",
            "faceCount": len(detections),
            "bbox": bbox,
            "detector": build_detector_info(used="mediapipe", status="active"),
        }

    return detect_faces_with_mediapipe_tasks(frame)


def detect_faces_with_opencv(gray_frame, fallback_reason: str | None = None):
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return {
            "source": "opencv",
            "error": "OpenCV Haar cascade unavailable.",
            "faceCount": 0,
            "bbox": None,
            "detector": build_detector_info(used="opencv", status="unavailable", fallback_reason=fallback_reason),
        }

    faces = detector.detectMultiScale(gray_frame, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    face_count = int(len(faces))
    if face_count <= 0:
        return {
            "source": "opencv",
            "faceCount": 0,
            "bbox": None,
            "detector": build_detector_info(used="opencv", status="no_face", fallback_reason=fallback_reason),
        }

    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    return {
        "source": "opencv",
        "faceCount": face_count,
        "bbox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
        "detector": build_detector_info(used="opencv", status="active", fallback_reason=fallback_reason),
    }


def main() -> None:
    payload = load_payload()
    if str(payload.get("mode") or "").lower() == "health":
        print(json.dumps({
            "status": "ready" if (MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None) else "limited",
            "source": "mediapipe" if (MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None) else "opencv",
            "pythonVersion": platform.python_version(),
            "opencvVersion": getattr(cv2, "__version__", "unknown"),
            "mediapipeVersion": getattr(mp, "__version__", None) if mp is not None else None,
            "detector": build_detector_info(
                used="mediapipe" if (MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None) else "opencv",
                status="active" if (MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None) else "fallback",
                fallback_reason=None if (MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None) else "mediapipe_unavailable",
            ),
        }))
        return

    frame = decode_image(str(payload.get("imageBase64", "")))
    if frame is None:
        print(json.dumps({
            "status": "invalid",
            "message": "Frame could not be decoded.",
            "source": "unavailable",
            "faceCount": 0,
            "eyeCount": 0,
            "bbox": None,
            "faceCropBase64": "",
            "detector": build_detector_info(used="unavailable", status="invalid", fallback_reason="decode_failed"),
        }))
        return

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    detection = detect_faces_with_mediapipe(frame)
    if detection is None:
        detection = detect_faces_with_opencv(gray, fallback_reason="mediapipe_unavailable")
    elif detection.get("faceCount", 0) == 0:
        fallback = detect_faces_with_opencv(gray, fallback_reason="mediapipe_no_face")
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
        eye_count = detect_eyes(gray, (bbox["x"], bbox["y"], bbox["width"], bbox["height"]))

    crop_b64 = encode_crop(frame, None if bbox is None else (bbox["x"], bbox["y"], bbox["width"], bbox["height"]))
    source = str(detection.get("source") or ("mediapipe" if (MEDIAPIPE_FACE_DETECTION is not None or MEDIAPIPE_TASKS_FACE_DETECTOR is not None) else "opencv"))

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
            "detector": build_detector_info(
                used="unavailable",
                status="runtime_error",
                fallback_reason="python_runtime_exception",
            ),
            "traceback": traceback.format_exc(),
        }))
