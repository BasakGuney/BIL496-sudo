from __future__ import annotations

import base64
import json
import platform
import traceback
import sys
from typing import Any

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

try:
    import mediapipe as mp  # type: ignore
except Exception as exc:
    mp = None
    MEDIAPIPE_IMPORT_ERROR = str(exc)


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
        "mediapipeAvailable": mp is not None,
        "fallbackReason": fallback_reason,
        "mediapipeImportError": MEDIAPIPE_IMPORT_ERROR,
        "status": status,
    }


def detect_faces_with_mediapipe(frame):
    if mp is None:
        return None

    frame_height, frame_width = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    detector = mp.solutions.face_detection.FaceDetection(
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
            "status": "ready" if mp is not None else "limited",
            "source": "mediapipe" if mp is not None else "opencv",
            "pythonVersion": platform.python_version(),
            "opencvVersion": getattr(cv2, "__version__", "unknown"),
            "mediapipeVersion": getattr(mp, "__version__", None) if mp is not None else None,
            "detector": build_detector_info(
                used="mediapipe" if mp is not None else "opencv",
                status="active" if mp is not None else "fallback",
                fallback_reason=None if mp is not None else "mediapipe_unavailable",
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
    source = str(detection.get("source") or ("mediapipe" if mp is not None else "opencv"))

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
