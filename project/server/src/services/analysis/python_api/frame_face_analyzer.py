from __future__ import annotations

import base64
import json
import sys

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception as exc:  # noqa: BLE001
    print(json.dumps({
        "status": "unavailable",
        "message": f"Python vision dependencies unavailable: {exc}",
        "faceCount": 0,
        "eyeCount": 0,
        "bbox": None,
        "faceCropBase64": "",
    }))
    raise SystemExit(0)


def load_payload() -> dict:
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


def main() -> None:
    payload = load_payload()
    frame = decode_image(str(payload.get("imageBase64", "")))
    if frame is None:
        print(json.dumps({
            "status": "invalid",
            "message": "Frame could not be decoded.",
            "faceCount": 0,
            "eyeCount": 0,
            "bbox": None,
            "faceCropBase64": "",
        }))
        return

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        print(json.dumps({
            "status": "unavailable",
            "message": "OpenCV Haar cascade unavailable.",
            "faceCount": 0,
            "eyeCount": 0,
            "bbox": None,
            "faceCropBase64": "",
        }))
        return

    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    face_count = int(len(faces))
    bbox = None
    eye_count = 0
    if face_count > 0:
        x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
        bbox = {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}
        eye_count = detect_eyes(gray, (bbox["x"], bbox["y"], bbox["width"], bbox["height"]))

    crop_b64 = encode_crop(frame, None if bbox is None else (bbox["x"], bbox["y"], bbox["width"], bbox["height"]))

    print(json.dumps({
        "status": "ready" if bbox else "no_face",
        "message": "Yüz algılandı." if bbox else "Yüz bulunamadı. Kameraya hizalanın.",
        "faceCount": face_count,
        "eyeCount": eye_count,
        "bbox": bbox,
        "faceCropBase64": crop_b64,
        "imageWidth": int(frame.shape[1]),
        "imageHeight": int(frame.shape[0]),
    }))


if __name__ == "__main__":
    main()
