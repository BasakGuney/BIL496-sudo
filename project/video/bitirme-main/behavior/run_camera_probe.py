from __future__ import annotations

import json
from dataclasses import asdict

try:
    from .camera_analyzer import CameraAnalyzerConfig, CameraBehaviorAnalyzer
    from .scoring import score_camera_metrics
    from .templates import generate_camera_feedback
except ImportError:
    from camera_analyzer import CameraAnalyzerConfig, CameraBehaviorAnalyzer
    from scoring import score_camera_metrics
    from templates import generate_camera_feedback


def main() -> None:
    config = CameraAnalyzerConfig(duration_sec=15, fps=10, camera_index=0)
    analyzer = CameraBehaviorAnalyzer(config=config)

    metrics = analyzer.analyze()
    scores = score_camera_metrics(metrics)
    feedback = generate_camera_feedback(metrics, scores)

    output = {
        "camera_metrics": asdict(metrics),
        "camera_scores": asdict(scores),
        "camera_feedback": feedback,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
