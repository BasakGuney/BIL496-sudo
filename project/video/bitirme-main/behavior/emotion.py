from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Optional

import cv2
import numpy as np


class EmotionModelUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class EmotionResult:
    scores: dict[str, float]
    top_label: str
    top_score: float


@dataclass(frozen=True)
class EmotionSample:
    result: EmotionResult
    face_bgr: np.ndarray
    face_count: int


class EmotionAnalyzer:
    def __init__(
        self,
        model_id: str = "dima806/facial_emotions_image_detection",
        interval_sec: float = 1.0,
    ) -> None:
        try:
            from PIL import Image  # type: ignore
            import torch  # type: ignore
            from transformers import (  # type: ignore
                AutoImageProcessor,
                AutoModelForImageClassification,
            )
        except Exception as exc:  # noqa: BLE001
            raise EmotionModelUnavailable(
                "Emotion analysis requires 'transformers', 'torch', and 'Pillow'."
            ) from exc

        self._Image = Image
        self._torch = torch
        self._processor = AutoImageProcessor.from_pretrained(model_id)
        self._model = AutoModelForImageClassification.from_pretrained(model_id)
        self._model.eval()
        self._id2label = {int(k): v for k, v in self._model.config.id2label.items()}

        self._interval_sec = max(0.2, float(interval_sec))
        self._next_at = 0.0
        self.last_skip_reason: Optional[str] = None
        self.last_face_count: int = 0

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self._face_detector = cv2.CascadeClassifier(cascade_path)
        self._use_face_detector = not self._face_detector.empty()

    def analyze_face(self, face_bgr: np.ndarray) -> EmotionResult:
        frame_rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
        image = self._Image.fromarray(frame_rgb)

        inputs = self._processor(images=image, return_tensors="pt")
        with self._torch.no_grad():
            outputs = self._model(**inputs)
        probs = self._torch.nn.functional.softmax(outputs.logits, dim=-1)[0]
        probs_np = probs.detach().cpu().numpy()

        scores = {self._id2label[i]: float(probs_np[i]) for i in range(len(probs_np))}
        top_idx = int(np.argmax(probs_np))
        top_label = self._id2label.get(top_idx, str(top_idx))
        top_score = float(probs_np[top_idx])

        return EmotionResult(scores=scores, top_label=top_label, top_score=top_score)

    def maybe_analyze(self, frame_bgr: np.ndarray, now: Optional[float] = None) -> Optional[EmotionSample]:
        ts = time.time() if now is None else now
        if ts < self._next_at:
            self.last_skip_reason = "interval"
            return None
        self._next_at = ts + self._interval_sec

        self.last_skip_reason = None
        face, face_count = self._extract_face(frame_bgr)
        self.last_face_count = face_count
        if face is None or face_count != 1:
            if face_count > 1:
                self.last_skip_reason = "multi_face"
            else:
                self.last_skip_reason = "no_face"
            return None

        result = self.analyze_face(face)

        return EmotionSample(
            result=result,
            face_bgr=face,
            face_count=face_count,
        )

    def _extract_face(self, frame_bgr: np.ndarray) -> tuple[Optional[np.ndarray], int]:
        if not self._use_face_detector:
            return frame_bgr, 1

        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        faces = self._face_detector.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(60, 60),
        )
        if len(faces) == 0:
            return None, 0
        if len(faces) > 1:
            return None, len(faces)

        x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
        x0 = max(x, 0)
        y0 = max(y, 0)
        x1 = min(x + w, frame_bgr.shape[1])
        y1 = min(y + h, frame_bgr.shape[0])
        if x1 <= x0 or y1 <= y0:
            return None, len(faces)
        return frame_bgr[y0:y1, x0:x1], len(faces)
