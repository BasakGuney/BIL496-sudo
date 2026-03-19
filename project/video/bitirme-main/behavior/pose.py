from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np


# Landmark indices used for coarse head pose estimation.
NOSE_TIP = 1
CHIN = 152
LEFT_EYE_OUTER = 33
RIGHT_EYE_OUTER = 263
LEFT_MOUTH = 61
RIGHT_MOUTH = 291


@dataclass(frozen=True)
class PoseAngles:
    pitch: float
    yaw: float
    roll: float


@dataclass(frozen=True)
class PoseEstimateResult:
    face_detected: bool
    pose: Optional[PoseAngles]


class FacePoseEstimator:
    """Face detection + head pose estimation using MediaPipe FaceMesh and solvePnP."""

    def __init__(self) -> None:
        try:
            face_mesh_cls = mp.solutions.face_mesh.FaceMesh
        except AttributeError as exc:
            raise RuntimeError(
                "Installed mediapipe package does not expose FaceMesh (mp.solutions). "
                "Use a MediaPipe release that includes FaceMesh solutions API."
            ) from exc

        self._face_mesh = face_mesh_cls(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def close(self) -> None:
        self._face_mesh.close()

    def analyze_frame(self, frame_bgr: np.ndarray) -> PoseEstimateResult:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self._face_mesh.process(frame_rgb)

        if not result.multi_face_landmarks:
            return PoseEstimateResult(face_detected=False, pose=None)

        landmarks = result.multi_face_landmarks[0].landmark
        pose = self._estimate_pose_from_landmarks(landmarks, frame_bgr.shape)
        return PoseEstimateResult(face_detected=True, pose=pose)

    def _estimate_pose_from_landmarks(
        self,
        landmarks: list,
        frame_shape: tuple[int, int, int],
    ) -> Optional[PoseAngles]:
        image_points = self._extract_image_points(landmarks, frame_shape)
        if image_points is None:
            return None

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

        height, width = frame_shape[:2]
        focal_length = float(width)
        camera_matrix = np.array(
            [
                [focal_length, 0, width / 2.0],
                [0, focal_length, height / 2.0],
                [0, 0, 1],
            ],
            dtype=np.float64,
        )
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        success, rotation_vector, _ = cv2.solvePnP(
            model_points,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not success:
            return None

        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
        angles, *_ = cv2.RQDecomp3x3(rotation_matrix)
        if angles is None or len(angles) < 3:
            return None

        pitch, yaw, roll = (float(angles[0]), float(angles[1]), float(angles[2]))
        return PoseAngles(pitch=pitch, yaw=yaw, roll=roll)

    def _extract_image_points(
        self,
        landmarks: list,
        frame_shape: tuple[int, int, int],
    ) -> Optional[np.ndarray]:
        height, width = frame_shape[:2]
        indices = [
            NOSE_TIP,
            CHIN,
            LEFT_EYE_OUTER,
            RIGHT_EYE_OUTER,
            LEFT_MOUTH,
            RIGHT_MOUTH,
        ]

        points: list[tuple[float, float]] = []
        for idx in indices:
            if idx >= len(landmarks):
                return None
            lm = landmarks[idx]
            points.append((lm.x * width, lm.y * height))

        return np.array(points, dtype=np.float64)
