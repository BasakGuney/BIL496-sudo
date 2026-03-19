from __future__ import annotations

import time
from collections import defaultdict
import base64
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

try:
    from .emotion import EmotionAnalyzer, EmotionModelUnavailable
    from .pose import FacePoseEstimator
except ImportError:
    from emotion import EmotionAnalyzer, EmotionModelUnavailable
    from pose import FacePoseEstimator


@dataclass(frozen=True)
class CameraAnalyzerConfig:
    duration_sec: int = 15
    fps: int = 10
    camera_index: int = 0
    enable_emotion: bool = True
    emotion_interval_sec: float = 5.0


@dataclass(frozen=True)
class CameraMetrics:
    total_frames: int
    face_frames: int
    face_presence_ratio: float
    pitch_std: Optional[float]
    yaw_std: Optional[float]
    roll_std: Optional[float]
    head_movement_raw: Optional[float]
    quality_note: list[str] = field(default_factory=list)
    emotion_samples: int = 0
    dominant_emotion: Optional[str] = None
    dominant_emotion_score: Optional[float] = None
    emotion_distribution: dict[str, float] = field(default_factory=dict)
    emotion_note: Optional[str] = None
    emotion_sample_frames: list[int] = field(default_factory=list)
    emotion_sample_timestamps: list[float] = field(default_factory=list)
    emotion_sample_results: list[dict[str, float | str | int]] = field(default_factory=list)
    emotion_skipped_multi_face: int = 0


class CameraBehaviorAnalyzer:
    def __init__(self, config: CameraAnalyzerConfig | None = None) -> None:
        self.config = config or CameraAnalyzerConfig()

    def analyze(self) -> CameraMetrics:
        cap = cv2.VideoCapture(self.config.camera_index)

        if not cap.isOpened():
            cap.release()
            return CameraMetrics(
                total_frames=0,
                face_frames=0,
                face_presence_ratio=0.0,
                pitch_std=None,
                yaw_std=None,
                roll_std=None,
                head_movement_raw=None,
                quality_note=[
                    "Camera could not be opened. Check system camera permissions and camera index.",
                    "Face detection was limited; camera alignment/lighting may need adjustment.",
                    "Head pose estimation was unavailable or unreliable for this session.",
                ],
            )

        pose_estimator: Optional[FacePoseEstimator] = None
        pose_note: Optional[str] = None
        try:
            pose_estimator = FacePoseEstimator()
        except RuntimeError as exc:
            pose_note = str(exc)

        emotion_analyzer: Optional[EmotionAnalyzer] = None
        emotion_note: Optional[str] = None
        if self.config.enable_emotion:
            try:
                emotion_analyzer = EmotionAnalyzer(interval_sec=self.config.emotion_interval_sec)
            except EmotionModelUnavailable as exc:
                emotion_note = str(exc)

        total_frames = 0
        face_frames = 0
        pitches: list[float] = []
        yaws: list[float] = []
        rolls: list[float] = []

        interval = 1.0 / float(max(self.config.fps, 1))
        start_time = time.time()
        end_time = start_time + float(max(self.config.duration_sec, 1))

        emotion_samples = 0
        emotion_sample_frames: list[int] = []
        emotion_sample_timestamps: list[float] = []
        emotion_sample_results: list[dict[str, float | str | int]] = []
        emotion_score_sums: dict[str, float] = defaultdict(float)
        emotion_skipped_multi_face = 0

        try:
            while time.time() < end_time:
                loop_start = time.time()
                ok, frame = cap.read()
                if not ok:
                    time.sleep(interval)
                    continue

                total_frames += 1
                if pose_estimator is not None:
                    frame_result = pose_estimator.analyze_frame(frame)
                    if frame_result.face_detected:
                        face_frames += 1
                    if frame_result.pose is not None:
                        pitches.append(frame_result.pose.pitch)
                        yaws.append(frame_result.pose.yaw)
                        rolls.append(frame_result.pose.roll)

                if emotion_analyzer is not None:
                    emotion_sample = emotion_analyzer.maybe_analyze(frame, now=loop_start)
                    if emotion_sample is not None:
                        emotion_samples += 1
                        emotion_sample_frames.append(total_frames)
                        emotion_sample_timestamps.append(loop_start - start_time)
                        face_bgr = emotion_sample.face_bgr
                        face_bgr = self._resize_face(face_bgr, max_size=180)
                        ok, buffer = cv2.imencode(".jpg", face_bgr)
                        face_b64 = ""
                        if ok:
                            face_b64 = base64.b64encode(buffer.tobytes()).decode("ascii")
                        emotion_sample_results.append(
                            {
                                "frame": total_frames,
                                "time_sec": float(loop_start - start_time),
                                "label": emotion_sample.result.top_label,
                                "score": float(emotion_sample.result.top_score),
                                "face_jpeg_base64": face_b64,
                            }
                        )
                        for label, score in emotion_sample.result.scores.items():
                            emotion_score_sums[label] += score
                    elif emotion_analyzer.last_skip_reason == "multi_face":
                        emotion_skipped_multi_face += 1

                elapsed = time.time() - loop_start
                if elapsed < interval:
                    time.sleep(interval - elapsed)
        finally:
            cap.release()
            if pose_estimator is not None:
                pose_estimator.close()

        ratio = (face_frames / total_frames) if total_frames > 0 else 0.0

        pitch_std = self._safe_std(pitches)
        yaw_std = self._safe_std(yaws)
        roll_std = self._safe_std(rolls)

        head_movement_raw = None
        if pitch_std is not None and yaw_std is not None:
            head_movement_raw = pitch_std + yaw_std

        quality_note: list[str] = []
        if ratio < 0.3:
            quality_note.append("Face detection was limited; camera alignment/lighting may need adjustment.")
        if head_movement_raw is None:
            quality_note.append("Head pose estimation was unavailable or unreliable for this session.")
        if pose_note:
            quality_note.append(pose_note)

        emotion_distribution: dict[str, float] = {}
        dominant_emotion: Optional[str] = None
        dominant_emotion_score: Optional[float] = None
        if emotion_samples > 0:
            emotion_distribution = {
                label: score / float(emotion_samples)
                for label, score in emotion_score_sums.items()
            }
            dominant_emotion = max(emotion_distribution, key=emotion_distribution.get)
            dominant_emotion_score = emotion_distribution[dominant_emotion]
        elif self.config.enable_emotion and emotion_note is None:
            quality_note.append("Emotion analysis did not detect a face during sampling.")

        if emotion_note:
            quality_note.append(emotion_note)

        return CameraMetrics(
            total_frames=total_frames,
            face_frames=face_frames,
            face_presence_ratio=ratio,
            pitch_std=pitch_std,
            yaw_std=yaw_std,
            roll_std=roll_std,
            head_movement_raw=head_movement_raw,
            quality_note=quality_note,
            emotion_samples=emotion_samples,
            dominant_emotion=dominant_emotion,
            dominant_emotion_score=dominant_emotion_score,
            emotion_distribution=emotion_distribution,
            emotion_note=emotion_note,
            emotion_sample_frames=emotion_sample_frames,
            emotion_sample_timestamps=emotion_sample_timestamps,
            emotion_sample_results=emotion_sample_results,
            emotion_skipped_multi_face=emotion_skipped_multi_face,
        )

    @staticmethod
    def _resize_face(face_bgr: np.ndarray, max_size: int = 180) -> np.ndarray:
        height, width = face_bgr.shape[:2]
        if max(height, width) <= max_size:
            return face_bgr
        scale = float(max_size) / float(max(height, width))
        new_w = max(1, int(width * scale))
        new_h = max(1, int(height * scale))
        return cv2.resize(face_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    @staticmethod
    def _safe_std(values: list[float]) -> Optional[float]:
        if not values:
            return None
        return float(np.std(np.array(values, dtype=np.float64), ddof=0))
