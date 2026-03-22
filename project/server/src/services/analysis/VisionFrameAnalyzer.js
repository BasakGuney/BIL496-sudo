import { spawn } from "node:child_process";
import path from "node:path";

export class VisionFrameAnalyzer {
  constructor({ pythonBin = process.env.PYTHON_BIN || "python3", logger = console } = {}) {
    this.pythonBin = pythonBin;
    this.logger = logger;
    this.scriptPath = path.resolve(process.cwd(), "src/services/analysis/python_api/vision_analyzer.py");
  }

  runAnalyzer(payload = {}) {
    return new Promise((resolve) => {
      const child = spawn(this.pythonBin, [this.scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        this.logger.warn("Vision frame analyzer process error", error);
        resolve({
          status: "unavailable",
          message: `Python vision analyzer unavailable: ${error.message}`,
          faceCount: 0,
          bbox: null,
          faceCropBase64: "",
        });
      });
      child.on("close", () => {
        if (!stdout.trim()) {
          const detail = stderr.trim();
          if (detail) {
            this.logger.warn("Vision frame analyzer produced no JSON output", detail);
          }
          resolve({
            status: "unavailable",
            message: detail
              ? `Vision analyzer exited without JSON output: ${detail.split("\n")[0]}`
              : "Vision analyzer exited without JSON output.",
            faceCount: 0,
            bbox: null,
            faceCropBase64: "",
          });
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          this.logger.warn("Vision frame analyzer returned invalid JSON", stderr || stdout);
          resolve({
            status: "unavailable",
            message: stderr?.trim()
              ? `Vision analyzer returned invalid output: ${stderr.trim().split("\n")[0]}`
              : "Vision analyzer returned invalid output.",
            faceCount: 0,
            bbox: null,
            faceCropBase64: "",
          });
        }
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });
  }

  async healthCheck() {
    const result = await this.runAnalyzer({ mode: "health" });
    return {
      status: String(result?.status || "unavailable"),
      source: String(result?.source || "unavailable"),
      pythonVersion: String(result?.pythonVersion || ""),
      opencvVersion: String(result?.opencvVersion || ""),
      mediapipeVersion: result?.mediapipeVersion ? String(result.mediapipeVersion) : null,
      detector: result?.detector || null,
      message: String(result?.message || ""),
    };
  }

  analyzeFrame({ imageBase64 = "" } = {}) {
    if (!imageBase64) {
      return Promise.resolve({ status: "invalid", message: "Frame payload missing.", faceCount: 0, bbox: null, faceCropBase64: "" });
    }
    return this.runAnalyzer({ imageBase64 });
  }
}
