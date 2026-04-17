import { spawn } from "node:child_process";
import path from "node:path";
import { resolvePythonBin } from "../../utils/pythonBin.js";

export class VisionFrameAnalyzer {
  constructor({ pythonBin = resolvePythonBin(), pythonApiBaseUrl = process.env.PYTHON_API_BASE_URL || "", logger = console, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
    this.pythonBin = pythonBin;
    this.pythonApiBaseUrl = String(pythonApiBaseUrl || "").replace(/\/$/, "");
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.scriptPath = path.resolve(process.cwd(), "src/services/analysis/python_api/vision_analyzer.py");
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = this.timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async runAnalyzerViaHttp(payload = {}) {
    const mode = String(payload?.mode || "").toLowerCase();
    const endpoint = mode === "health" ? "/vision-health" : "/frame-analyze";
    const options = mode === "health"
      ? { method: "GET" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: String(payload?.imageBase64 || "") }),
        };

    try {
      const response = await this.fetchWithTimeout(`${this.pythonApiBaseUrl}${endpoint}`, options);
      if (!response.ok) {
        const detail = await response.text();
        return {
          status: "unavailable",
          message: `Python vision API failed: ${response.status}${detail ? ` - ${detail}` : ""}`,
          faceCount: 0,
          bbox: null,
          faceCropBase64: "",
          source: "unavailable",
        };
      }

      return await response.json();
    } catch (error) {
      this.logger.warn("Vision frame analyzer HTTP request failed", error);
      return {
        status: "unavailable",
        message: `Python vision API unavailable: ${error?.message || "unknown error"}`,
        faceCount: 0,
        bbox: null,
        faceCropBase64: "",
        source: "unavailable",
      };
    }
  }

  runAnalyzer(payload = {}) {
    if (this.pythonApiBaseUrl) {
      return this.runAnalyzerViaHttp(payload);
    }

    return new Promise((resolve) => {
      const child = spawn(this.pythonBin, [this.scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finalize = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.stdin.on("error", (error) => {
        this.logger.warn("Vision frame analyzer stdin error", error);
        finalize({
          status: "unavailable",
          message: `Vision analyzer stdin error: ${error.message}`,
          faceCount: 0,
          bbox: null,
          faceCropBase64: "",
        });
      });
      child.on("error", (error) => {
        this.logger.warn("Vision frame analyzer process error", error);
        finalize({
          status: "unavailable",
          message: `Python vision analyzer unavailable: ${error.message}`,
          faceCount: 0,
          bbox: null,
          faceCropBase64: "",
        });
      });
      child.on("close", () => {
        if (settled) return;
        if (!stdout.trim()) {
          const detail = stderr.trim();
          if (detail) {
            this.logger.warn("Vision frame analyzer produced no JSON output", detail);
          }
          finalize({
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
          finalize(JSON.parse(stdout));
        } catch {
          this.logger.warn("Vision frame analyzer returned invalid JSON", stderr || stdout);
          finalize({
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

      try {
        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();
      } catch (error) {
        this.logger.warn("Vision frame analyzer failed to send payload", error);
        finalize({
          status: "unavailable",
          message: `Vision analyzer write failed: ${error.message}`,
          faceCount: 0,
          bbox: null,
          faceCropBase64: "",
        });
      }
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
