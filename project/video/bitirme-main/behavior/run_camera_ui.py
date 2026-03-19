from __future__ import annotations

import json
import queue
import threading
import tkinter as tk
from dataclasses import asdict
from tkinter import ttk

try:
    from .camera_analyzer import CameraAnalyzerConfig, CameraBehaviorAnalyzer
    from .scoring import score_camera_metrics
    from .templates import generate_camera_feedback
except ImportError:
    from camera_analyzer import CameraAnalyzerConfig, CameraBehaviorAnalyzer
    from scoring import score_camera_metrics
    from templates import generate_camera_feedback


class CameraProbeUI:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Camera Behavior Probe")
        self.root.geometry("860x620")

        self._result_queue: queue.Queue[tuple[str, str, str]] = queue.Queue()
        self._is_running = False

        self.duration_var = tk.StringVar(value="15")
        self.fps_var = tk.StringVar(value="10")
        self.camera_index_var = tk.StringVar(value="0")
        self.status_var = tk.StringVar(value="Hazır")

        self._build_layout()
        self._poll_queue()

    def _build_layout(self) -> None:
        top_frame = ttk.Frame(self.root, padding=12)
        top_frame.pack(fill="x")

        ttk.Label(top_frame, text="Süre (sn):").grid(row=0, column=0, sticky="w", padx=(0, 6))
        ttk.Entry(top_frame, textvariable=self.duration_var, width=8).grid(row=0, column=1, padx=(0, 12))

        ttk.Label(top_frame, text="FPS:").grid(row=0, column=2, sticky="w", padx=(0, 6))
        ttk.Entry(top_frame, textvariable=self.fps_var, width=8).grid(row=0, column=3, padx=(0, 12))

        ttk.Label(top_frame, text="Kamera Index:").grid(row=0, column=4, sticky="w", padx=(0, 6))
        ttk.Entry(top_frame, textvariable=self.camera_index_var, width=8).grid(row=0, column=5, padx=(0, 12))

        self.start_button = ttk.Button(top_frame, text="Probe Başlat", command=self.start_probe)
        self.start_button.grid(row=0, column=6)

        status_frame = ttk.Frame(self.root, padding=(12, 0, 12, 8))
        status_frame.pack(fill="x")
        ttk.Label(status_frame, text="Durum:").pack(side="left")
        ttk.Label(status_frame, textvariable=self.status_var).pack(side="left", padx=(6, 0))

        feedback_frame = ttk.LabelFrame(self.root, text="Kamera Geri Bildirimi", padding=10)
        feedback_frame.pack(fill="x", padx=12, pady=(0, 8))

        self.feedback_text = tk.Text(feedback_frame, height=6, wrap="word")
        self.feedback_text.pack(fill="both", expand=True)

        json_frame = ttk.LabelFrame(self.root, text="JSON Çıktı", padding=10)
        json_frame.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        self.output_text = tk.Text(json_frame, wrap="none")
        self.output_text.pack(side="left", fill="both", expand=True)

        y_scroll = ttk.Scrollbar(json_frame, orient="vertical", command=self.output_text.yview)
        y_scroll.pack(side="right", fill="y")
        self.output_text.configure(yscrollcommand=y_scroll.set)

    def start_probe(self) -> None:
        if self._is_running:
            return

        try:
            duration = int(self.duration_var.get())
            fps = int(self.fps_var.get())
            camera_index = int(self.camera_index_var.get())
            if duration <= 0 or fps <= 0:
                raise ValueError
        except ValueError:
            self.status_var.set("Hata: Süre/FPS/Kamera index geçerli sayı olmalı.")
            return

        self._is_running = True
        self.start_button.configure(state="disabled")
        self.status_var.set("Kamera analizi çalışıyor...")
        self.feedback_text.delete("1.0", tk.END)

        worker = threading.Thread(
            target=self._run_probe,
            args=(duration, fps, camera_index),
            daemon=True,
        )
        worker.start()

    def _run_probe(self, duration: int, fps: int, camera_index: int) -> None:
        try:
            config = CameraAnalyzerConfig(
                duration_sec=duration,
                fps=fps,
                camera_index=camera_index,
            )
            analyzer = CameraBehaviorAnalyzer(config=config)
            metrics = analyzer.analyze()
            scores = score_camera_metrics(metrics)
            feedback = generate_camera_feedback(metrics, scores)

            output = {
                "camera_metrics": asdict(metrics),
                "camera_scores": asdict(scores),
                "camera_feedback": feedback,
            }
            formatted_json = json.dumps(output, ensure_ascii=False, indent=2)
            formatted_feedback = "\n".join(f"- {item}" for item in feedback)

            self._result_queue.put(("success", formatted_json + "\n" + "\n", formatted_feedback))
        except Exception as exc:  # noqa: BLE001
            self._result_queue.put(("error", str(exc), ""))

    def _poll_queue(self) -> None:
        try:
            event_type, payload, feedback = self._result_queue.get_nowait()
        except queue.Empty:
            self.root.after(100, self._poll_queue)
            return

        if event_type == "success":
            self.output_text.delete("1.0", tk.END)
            self.output_text.insert(tk.END, payload)
            self.feedback_text.delete("1.0", tk.END)
            self.feedback_text.insert(tk.END, feedback)
            self.status_var.set("Tamamlandı")
        else:
            self.status_var.set(f"Hata: {payload}")

        self._is_running = False
        self.start_button.configure(state="normal")
        self.root.after(100, self._poll_queue)


def main() -> None:
    root = tk.Tk()
    app = CameraProbeUI(root)
    _ = app
    root.mainloop()


if __name__ == "__main__":
    main()
