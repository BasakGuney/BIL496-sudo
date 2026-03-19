from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
import base64
import threading
import time
from typing import Generator, Optional

import cv2
import mediapipe as mp
import numpy as np
from flask import Flask, Response, jsonify, render_template, request

try:
    from .camera_analyzer import CameraAnalyzerConfig, CameraBehaviorAnalyzer
    from .emotion import EmotionAnalyzer, EmotionModelUnavailable
    from .scoring import score_camera_metrics
    from .templates import generate_camera_feedback
except ImportError:
    from camera_analyzer import CameraAnalyzerConfig, CameraBehaviorAnalyzer
    from emotion import EmotionAnalyzer, EmotionModelUnavailable
    from scoring import score_camera_metrics
    from templates import generate_camera_feedback


@dataclass(frozen=True)
class WebUIConfig:
    host: str = "127.0.0.1"
    port: int = 8080
    camera_index: int = 0


@dataclass(frozen=True)
class ProbeRequest:
    duration_sec: int
    fps: int
    camera_index: int

    @classmethod
    def from_payload(cls, payload: dict) -> "ProbeRequest":
        duration = int(payload.get("duration_sec", 15))
        fps = int(payload.get("fps", 10))
        camera_index = int(payload.get("camera_index", 0))

        if duration <= 0:
            raise ValueError("duration_sec must be greater than 0")
        if fps <= 0:
            raise ValueError("fps must be greater than 0")
        if camera_index < 0:
            raise ValueError("camera_index must be 0 or higher")

        return cls(duration_sec=duration, fps=fps, camera_index=camera_index)


class CameraStream:
    NOSE_TIP = 1
    CHIN = 152
    LEFT_EYE_OUTER_POSE = 33
    RIGHT_EYE_OUTER_POSE = 263
    LEFT_MOUTH = 61
    RIGHT_MOUTH = 291

    LEFT_EYE_OUTER = 33
    LEFT_EYE_INNER = 133
    LEFT_EYE_TOP = 159
    LEFT_EYE_BOTTOM = 145
    RIGHT_EYE_INNER = 362
    RIGHT_EYE_OUTER = 263
    RIGHT_EYE_TOP = 386
    RIGHT_EYE_BOTTOM = 374
    LEFT_IRIS = (468, 469, 470, 471)
    RIGHT_IRIS = (473, 474, 475, 476)

    def __init__(self, camera_index: int = 0) -> None:
        self.camera_index = camera_index
        self.cap = cv2.VideoCapture(self.camera_index)
        self.last_attention_warning = False
        self._recent_attention_flags: deque[bool] = deque(maxlen=8)
        self._recent_h_avg: deque[float] = deque(maxlen=24)
        self._recent_scan_flags: deque[bool] = deque(maxlen=10)
        self.horizontal_scan_warning = False
        self._eye_closed_since: Optional[float] = None
        self.prolonged_eye_closed_warning = False
        self._frame_index = 0
        self._last_frame_bgr: Optional[np.ndarray] = None
        self._last_face_bbox: Optional[tuple[int, int, int, int]] = None
        self._last_face_count: int = 0
        self._last_frame_ts: float = 0.0
        self._start_ts = time.monotonic()
        self._lock = threading.Lock()
        self._emotion_live = False
        self._emotion_last: Optional[dict] = None
        self._emotion_error: Optional[str] = None

        try:
            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=2,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self._mp_available = True
        except AttributeError:
            self.face_mesh = None
            self._mp_available = False

    def is_ready(self) -> bool:
        return self.cap.isOpened() and self._mp_available

    def close(self) -> None:
        if self.cap.isOpened():
            self.cap.release()
        if self.face_mesh is not None:
            self.face_mesh.close()

    def get_latest_face_crop(self) -> tuple[Optional[np.ndarray], dict]:
        with self._lock:
            frame = None if self._last_frame_bgr is None else self._last_frame_bgr.copy()
            bbox = self._last_face_bbox
            face_count = self._last_face_count
            frame_index = self._frame_index
            time_sec = max(0.0, self._last_frame_ts - self._start_ts)

        if frame is None:
            return None, {
                "reason": "no_frame",
                "face_count": face_count,
                "frame_index": frame_index,
                "time_sec": time_sec,
            }
        if bbox is None:
            return None, {
                "reason": "no_face",
                "face_count": face_count,
                "frame_index": frame_index,
                "time_sec": time_sec,
            }

        x1, y1, x2, y2 = bbox
        if x2 <= x1 or y2 <= y1:
            return None, {
                "reason": "invalid_bbox",
                "face_count": face_count,
                "frame_index": frame_index,
                "time_sec": time_sec,
            }
        return frame[y1:y2, x1:x2], {
            "reason": "ok",
            "face_count": face_count,
            "frame_index": frame_index,
            "time_sec": time_sec,
        }

    def set_emotion_live(self, enabled: bool) -> None:
        with self._lock:
            self._emotion_live = enabled
            self._emotion_error = None
            if not enabled:
                self._emotion_last = None

    def get_emotion_live(self) -> dict:
        with self._lock:
            return {
                "enabled": self._emotion_live,
                "last": self._emotion_last,
                "error": self._emotion_error,
            }

    def frames(self) -> Generator[bytes, None, None]:
        while True:
            ok, frame = self.cap.read()
            if not ok:
                break

            self._frame_index += 1
            annotated = self._annotate(frame, self._frame_index)
            ok, buffer = cv2.imencode(".jpg", annotated)
            if not ok:
                continue

            payload = buffer.tobytes()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + payload + b"\r\n"
            )

    def _annotate(self, frame_bgr: np.ndarray, frame_index: int) -> np.ndarray:
        raw_frame = frame_bgr.copy()
        now_ts = time.monotonic()
        if self.face_mesh is None:
            cv2.putText(
                frame_bgr,
                "MediaPipe FaceMesh unavailable",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 255),
                2,
                cv2.LINE_AA,
            )
            with self._lock:
                self._last_frame_bgr = raw_frame
                self._last_face_bbox = None
                self._last_face_count = 0
                self._frame_index = frame_index
                self._last_frame_ts = now_ts
                if self._emotion_live:
                    self._emotion_last = None
            return frame_bgr

        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self.face_mesh.process(frame_rgb)

        if not result.multi_face_landmarks:
            self._recent_attention_flags.append(False)
            self.last_attention_warning = False
            self._recent_h_avg.clear()
            self._recent_scan_flags.append(False)
            self.horizontal_scan_warning = False
            self._eye_closed_since = None
            self.prolonged_eye_closed_warning = False
            cv2.putText(
                frame_bgr,
                "Face not detected",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 165, 255),
                2,
                cv2.LINE_AA,
            )
            with self._lock:
                self._last_frame_bgr = raw_frame
                self._last_face_bbox = None
                self._last_face_count = 0
                self._frame_index = frame_index
                self._last_frame_ts = now_ts
                if self._emotion_live:
                    self._emotion_last = None
            return frame_bgr

        height, width = frame_bgr.shape[:2]
        face_count = len(result.multi_face_landmarks)
        landmarks = result.multi_face_landmarks[0].landmark
        xs = [lm.x for lm in landmarks]
        ys = [lm.y for lm in landmarks]
        x1 = max(int(min(xs) * width), 0)
        y1 = max(int(min(ys) * height), 0)
        x2 = min(int(max(xs) * width), width - 1)
        y2 = min(int(max(ys) * height), height - 1)

        cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            frame_bgr,
            "Face",
            (x1, max(y1 - 8, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

        eyes_closed = self._are_eyes_closed(landmarks, width, height)
        if eyes_closed:
            if self._eye_closed_since is None:
                self._eye_closed_since = now_ts
            self.prolonged_eye_closed_warning = (now_ts - self._eye_closed_since) >= 2.0
        else:
            self._eye_closed_since = None
            self.prolonged_eye_closed_warning = False

        h_avg_for_scan: Optional[float] = None
        if not eyes_closed:
            h_avg_for_scan = self._compute_horizontal_iris_ratio(landmarks, width, height)
        self._update_horizontal_scan_warning(h_avg_for_scan, eyes_closed)

        offscreen = self._is_looking_away(landmarks, width, height)
        if offscreen is not None:
            self._recent_attention_flags.append(offscreen)
            true_count = sum(self._recent_attention_flags)
            self.last_attention_warning = true_count >= max(1, int(len(self._recent_attention_flags) * 0.4))
        elif not self.prolonged_eye_closed_warning:
            self._recent_attention_flags.append(False)
            true_count = sum(self._recent_attention_flags)
            self.last_attention_warning = true_count >= max(1, int(len(self._recent_attention_flags) * 0.4))

        if self.last_attention_warning or self.prolonged_eye_closed_warning or self.horizontal_scan_warning:
            # High-visibility warning overlay for off-screen gaze.
            cv2.rectangle(frame_bgr, (0, 0), (width - 1, height - 1), (0, 0, 255), 8)
            cv2.rectangle(frame_bgr, (0, 0), (width, 70), (0, 0, 180), -1)
            warning_text = (
                "UYARI: Gozler 2 sn+ kapali"
                if self.prolonged_eye_closed_warning
                else ("UYARI: Yogun yatay goz hareketi" if self.horizontal_scan_warning else "UYARI: Ekrana geri bakin")
            )
            cv2.putText(
                frame_bgr,
                warning_text,
                (20, 45),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

        with self._lock:
            self._last_frame_bgr = raw_frame
            self._last_face_bbox = (x1, y1, x2, y2)
            self._last_face_count = face_count
            self._frame_index = frame_index
            self._last_frame_ts = now_ts

        if self._emotion_live:
            face_crop = raw_frame[y1:y2, x1:x2]
            try:
                analyzer = _get_emotion_model()
                result = analyzer.analyze_face(face_crop)
                with self._lock:
                    self._emotion_last = {
                        "label": result.top_label,
                        "score": result.top_score,
                        "frame": frame_index,
                        "time_sec": max(0.0, now_ts - self._start_ts),
                    }
                    self._emotion_error = None
            except EmotionModelUnavailable as exc:
                with self._lock:
                    self._emotion_error = str(exc)
                    self._emotion_live = False

        return frame_bgr

    def _is_looking_away(self, landmarks: list, width: int, height: int) -> Optional[bool]:
        required = [
            self.LEFT_EYE_OUTER,
            self.LEFT_EYE_INNER,
            self.LEFT_EYE_TOP,
            self.LEFT_EYE_BOTTOM,
            self.RIGHT_EYE_INNER,
            self.RIGHT_EYE_OUTER,
            self.RIGHT_EYE_TOP,
            self.RIGHT_EYE_BOTTOM,
            *self.LEFT_IRIS,
            *self.RIGHT_IRIS,
            self.NOSE_TIP,
            self.CHIN,
            self.LEFT_EYE_OUTER_POSE,
            self.RIGHT_EYE_OUTER_POSE,
            self.LEFT_MOUTH,
            self.RIGHT_MOUTH,
        ]
        if any(idx >= len(landmarks) for idx in required):
            return None

        left_iris_x, _ = self._mean_point(landmarks, self.LEFT_IRIS, width, height)
        right_iris_x, _ = self._mean_point(landmarks, self.RIGHT_IRIS, width, height)

        left_outer_x = landmarks[self.LEFT_EYE_OUTER].x * width
        left_inner_x = landmarks[self.LEFT_EYE_INNER].x * width
        right_inner_x = landmarks[self.RIGHT_EYE_INNER].x * width
        right_outer_x = landmarks[self.RIGHT_EYE_OUTER].x * width

        left_top_y = landmarks[self.LEFT_EYE_TOP].y * height
        left_bottom_y = landmarks[self.LEFT_EYE_BOTTOM].y * height
        right_top_y = landmarks[self.RIGHT_EYE_TOP].y * height
        right_bottom_y = landmarks[self.RIGHT_EYE_BOTTOM].y * height

        # Ignore blink/closed-eye frames for gaze direction logic.
        if self._are_eyes_closed(landmarks, width, height):
            return None

        left_h = self._normalize_between(left_iris_x, left_outer_x, left_inner_x)
        right_h = self._normalize_between(right_iris_x, right_inner_x, right_outer_x)
        yaw = self._estimate_yaw_from_landmarks(landmarks, width, height)

        if None in (left_h, right_h):
            return None

        h_avg = (left_h + right_h) / 2.0
        # Further relaxed thresholds to lower gaze sensitivity.
        iris_offscreen = h_avg < 0.33 or h_avg > 0.67
        yaw_offscreen = yaw is not None and abs(yaw) > 17.0
        return iris_offscreen or yaw_offscreen

    def _compute_horizontal_iris_ratio(self, landmarks: list, width: int, height: int) -> Optional[float]:
        required = [
            self.LEFT_EYE_OUTER,
            self.LEFT_EYE_INNER,
            self.RIGHT_EYE_INNER,
            self.RIGHT_EYE_OUTER,
            *self.LEFT_IRIS,
            *self.RIGHT_IRIS,
        ]
        if any(idx >= len(landmarks) for idx in required):
            return None

        left_iris_x, _ = self._mean_point(landmarks, self.LEFT_IRIS, width, height)
        right_iris_x, _ = self._mean_point(landmarks, self.RIGHT_IRIS, width, height)
        left_outer_x = landmarks[self.LEFT_EYE_OUTER].x * width
        left_inner_x = landmarks[self.LEFT_EYE_INNER].x * width
        right_inner_x = landmarks[self.RIGHT_EYE_INNER].x * width
        right_outer_x = landmarks[self.RIGHT_EYE_OUTER].x * width

        left_h = self._normalize_between(left_iris_x, left_outer_x, left_inner_x)
        right_h = self._normalize_between(right_iris_x, right_inner_x, right_outer_x)
        if None in (left_h, right_h):
            return None
        return float((left_h + right_h) / 2.0)

    def _update_horizontal_scan_warning(self, h_avg: Optional[float], eyes_closed: bool) -> None:
        if eyes_closed or h_avg is None:
            self._recent_scan_flags.append(False)
            flag_true = sum(self._recent_scan_flags)
            self.horizontal_scan_warning = flag_true >= max(1, int(len(self._recent_scan_flags) * 0.5))
            return

        self._recent_h_avg.append(h_avg)
        scan_now = False
        if len(self._recent_h_avg) >= 10:
            values = list(self._recent_h_avg)
            span = max(values) - min(values)

            diffs = [values[i] - values[i - 1] for i in range(1, len(values))]
            significant = [d for d in diffs if abs(d) >= 0.015]
            direction_changes = 0
            for i in range(1, len(significant)):
                if significant[i - 1] * significant[i] < 0:
                    direction_changes += 1

            # Observational rule: repeated horizontal eye sweeps in a short window.
            scan_now = span >= 0.16 and direction_changes >= 4

        self._recent_scan_flags.append(scan_now)
        flag_true = sum(self._recent_scan_flags)
        self.horizontal_scan_warning = flag_true >= max(1, int(len(self._recent_scan_flags) * 0.5))

    @staticmethod
    def _mean_point(landmarks: list, indices: tuple[int, ...], width: int, height: int) -> tuple[float, float]:
        xs = [landmarks[idx].x * width for idx in indices]
        ys = [landmarks[idx].y * height for idx in indices]
        return float(sum(xs) / len(xs)), float(sum(ys) / len(ys))

    @staticmethod
    def _safe_ratio(num: float, den: float) -> Optional[float]:
        if abs(den) < 1e-6:
            return None
        return float(num / den)

    def _are_eyes_closed(self, landmarks: list, width: int, height: int) -> bool:
        left_top_y = landmarks[self.LEFT_EYE_TOP].y * height
        left_bottom_y = landmarks[self.LEFT_EYE_BOTTOM].y * height
        right_top_y = landmarks[self.RIGHT_EYE_TOP].y * height
        right_bottom_y = landmarks[self.RIGHT_EYE_BOTTOM].y * height
        left_eye_open = abs(left_bottom_y - left_top_y)
        right_eye_open = abs(right_bottom_y - right_top_y)
        return left_eye_open < 2.0 or right_eye_open < 2.0

    @staticmethod
    def _normalize_between(value: float, a: float, b: float) -> Optional[float]:
        low = min(a, b)
        high = max(a, b)
        if abs(high - low) < 1e-6:
            return None
        return float((value - low) / (high - low))

    def _estimate_yaw_from_landmarks(self, landmarks: list, width: int, height: int) -> Optional[float]:
        idx = [
            self.NOSE_TIP,
            self.CHIN,
            self.LEFT_EYE_OUTER_POSE,
            self.RIGHT_EYE_OUTER_POSE,
            self.LEFT_MOUTH,
            self.RIGHT_MOUTH,
        ]
        image_points = np.array(
            [(landmarks[i].x * width, landmarks[i].y * height) for i in idx],
            dtype=np.float64,
        )
        model_points = np.array(
            [
                (0.0, 0.0, 0.0),
                (0.0, -63.6, -12.5),
                (-43.3, 32.7, -26.0),
                (43.3, 32.7, -26.0),
                (-28.9, -28.9, -24.1),
                (28.9, -28.9, -24.1),
            ],
            dtype=np.float64,
        )
        focal_length = float(width)
        camera_matrix = np.array(
            [
                [focal_length, 0.0, width / 2.0],
                [0.0, focal_length, height / 2.0],
                [0.0, 0.0, 1.0],
            ],
            dtype=np.float64,
        )
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        success, rotation_vec, _ = cv2.solvePnP(
            model_points,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not success:
            return None

        rotation_mat, _ = cv2.Rodrigues(rotation_vec)
        angles, *_ = cv2.RQDecomp3x3(rotation_mat)
        if angles is None or len(angles) < 2:
            return None
        return float(angles[1])


config = WebUIConfig()
app = Flask(__name__, template_folder="web")
stream = CameraStream(camera_index=config.camera_index)
_emotion_model: Optional[EmotionAnalyzer] = None


def _get_emotion_model() -> EmotionAnalyzer:
    global _emotion_model
    if _emotion_model is None:
        _emotion_model = EmotionAnalyzer()
    return _emotion_model


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.get("/video_feed")
def video_feed() -> Response:
    return Response(stream.frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.get("/health")
def health() -> Response:
    status = {
        "camera_open": stream.cap.isOpened(),
        "mediapipe_face_mesh": stream._mp_available,
        "attention_warning": stream.last_attention_warning or stream.prolonged_eye_closed_warning,
        "prolonged_eye_closed_warning": stream.prolonged_eye_closed_warning,
        "horizontal_scan_warning": stream.horizontal_scan_warning,
    }
    return jsonify(status)


@app.post("/run_probe")
def run_probe() -> Response:
    payload = request.get_json(silent=True) or {}

    try:
        probe_request = ProbeRequest.from_payload(payload)
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    analyzer = CameraBehaviorAnalyzer(
        config=CameraAnalyzerConfig(
            duration_sec=probe_request.duration_sec,
            fps=probe_request.fps,
            camera_index=probe_request.camera_index,
            enable_emotion=False,
        )
    )

    metrics = analyzer.analyze()
    scores = score_camera_metrics(metrics)
    feedback = generate_camera_feedback(metrics, scores)

    return jsonify(
        {
            "camera_metrics": asdict(metrics),
            "camera_scores": asdict(scores),
            "camera_feedback": feedback,
        }
    )


@app.post("/emotion_sample")
def emotion_sample() -> Response:
    if not stream.is_ready():
        return jsonify({"error": "Camera or MediaPipe not ready."}), 400

    face_crop, info = stream.get_latest_face_crop()
    if face_crop is None:
        reason = info.get("reason", "no_face")
        face_count = info.get("face_count", 0)
        return (
            jsonify(
                {
                    "error": "Face not suitable for emotion analysis.",
                    "reason": reason,
                    "face_count": face_count,
                    "frame": info.get("frame_index"),
                    "time_sec": info.get("time_sec"),
                }
            ),
            400,
        )

    try:
        analyzer = _get_emotion_model()
    except EmotionModelUnavailable as exc:
        return jsonify({"error": str(exc)}), 500

    result = analyzer.analyze_face(face_crop)
    face_bgr = _resize_face(face_crop, max_size=180)
    ok, buffer = cv2.imencode(".jpg", face_bgr)
    face_b64 = ""
    if ok:
        face_b64 = base64.b64encode(buffer.tobytes()).decode("ascii")

    return jsonify(
        {
            "label": result.top_label,
            "score": result.top_score,
            "scores": result.scores,
            "frame": info.get("frame_index"),
            "time_sec": info.get("time_sec"),
            "face_jpeg_base64": face_b64,
            "face_count": info.get("face_count"),
        }
    )


@app.route("/emotion_live", methods=["GET", "POST"])
def emotion_live() -> Response:
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        enabled = bool(payload.get("enabled", False))
        if enabled and not stream.is_ready():
            return jsonify({"error": "Camera or MediaPipe not ready."}), 400
        try:
            if enabled:
                _ = _get_emotion_model()
        except EmotionModelUnavailable as exc:
            return jsonify({"error": str(exc)}), 500
        stream.set_emotion_live(enabled)
    return jsonify(stream.get_emotion_live())


def _resize_face(face_bgr: np.ndarray, max_size: int = 180) -> np.ndarray:
    height, width = face_bgr.shape[:2]
    if max(height, width) <= max_size:
        return face_bgr
    scale = float(max_size) / float(max(height, width))
    new_w = max(1, int(width * scale))
    new_h = max(1, int(height * scale))
    return cv2.resize(face_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)


def main() -> None:
    try:
        app.run(host=config.host, port=config.port, debug=False)
    finally:
        stream.close()


if __name__ == "__main__":
    main()
