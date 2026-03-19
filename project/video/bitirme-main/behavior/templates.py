from __future__ import annotations

try:
    from .camera_analyzer import CameraMetrics
    from .scoring import CameraScores
except ImportError:
    from camera_analyzer import CameraMetrics
    from scoring import CameraScores


def generate_camera_feedback(metrics: CameraMetrics, scores: CameraScores) -> list[str]:
    feedback: list[str] = []

    if metrics.face_presence_ratio >= 0.7:
        feedback.append("Face was detected consistently during the session.")
    elif metrics.face_presence_ratio >= 0.3:
        feedback.append("Face was detected intermittently during the session.")
    else:
        feedback.append("Camera-based signals may be limited.")

    if metrics.head_movement_raw is None:
        feedback.append("Head movement observations were limited because pose estimation was unavailable.")
    elif metrics.head_movement_raw >= 8.0:
        feedback.append("Increased head movement was observed during responses.")
    elif metrics.head_movement_raw >= 4.0:
        feedback.append("Moderate head movement was observed during responses.")
    else:
        feedback.append("Head movement appeared relatively steady during responses.")

    if scores.movement_score is None:
        feedback.append("Movement score is unavailable due to limited pose data.")

    if metrics.dominant_emotion is not None:
        if metrics.dominant_emotion_score is not None:
            feedback.append(
                f"Dominant facial emotion was {metrics.dominant_emotion} "
                f"({metrics.dominant_emotion_score:.0%} avg confidence)."
            )
        else:
            feedback.append(f"Dominant facial emotion was {metrics.dominant_emotion}.")

    for note in metrics.quality_note:
        if note not in feedback:
            feedback.append(note)

    return feedback
