from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

try:
    from .camera_analyzer import CameraMetrics
except ImportError:
    from camera_analyzer import CameraMetrics


@dataclass(frozen=True)
class CameraScores:
    presence_score: float
    movement_score: Optional[float]


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _movement_score_from_raw(head_movement_raw: float) -> float:
    # Deterministic inverse mapping: lower movement variance -> higher score.
    # Raw >= 20 maps to 0, raw <= 0 maps to 100.
    normalized = 100.0 * (1.0 - min(max(head_movement_raw, 0.0), 20.0) / 20.0)
    return _clamp(normalized)


def score_camera_metrics(metrics: CameraMetrics) -> CameraScores:
    presence_score = _clamp(metrics.face_presence_ratio * 100.0)

    movement_score: Optional[float] = None
    if metrics.head_movement_raw is not None:
        movement_score = _movement_score_from_raw(metrics.head_movement_raw)

    return CameraScores(
        presence_score=presence_score,
        movement_score=movement_score,
    )
