import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";

const execAsync = promisify(exec);

export class PythonAnalysisClient {
  constructor({ baseUrl = "http://localhost:8000", fetchImpl = fetch, logger = console } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.connectionRefusedWarnings = new Set();
  }

  sanitizeSessionId(sessionId = "") {
    return String(sessionId || "unknown-session").replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  buildSessionFolderName(sessionId = "") {
    const safeSessionId = this.sanitizeSessionId(sessionId);
    return safeSessionId.startsWith("S-") ? safeSessionId : `S-${safeSessionId}`;
  }

  isConnectionRefused(error) {
    if (!error) return false;
    if (error?.cause?.code === "ECONNREFUSED") return true;
    if (Array.isArray(error?.cause?.errors) && error.cause.errors.some((item) => item?.code === "ECONNREFUSED")) {
      return true;
    }
    return false;
  }

  logServiceUnavailable(scope, error) {
    const key = `${scope}:${this.baseUrl}`;
    if (this.connectionRefusedWarnings.has(key)) return;
    this.connectionRefusedWarnings.add(key);
    this.logger.warn(`Python ${scope} service is unavailable at ${this.baseUrl}. Skipping ${scope} analysis until it is back online.`);
    if (error?.cause?.code && error.cause.code !== "ECONNREFUSED") {
      this.logger.warn(`Python ${scope} connection detail: ${error.cause.code}`);
    }
  }

  async convertToWav(inputPath) {
    const ext = path.extname(inputPath);
    if (ext.toLowerCase() === ".wav") {
      return inputPath; // Already WAV
    }
    
    const outputPath = inputPath.replace(new RegExp(`\\${ext}$`), ".wav");
    
    try {
      // Check if output already exists to avoid re-converting
      await fs.access(outputPath);
      return outputPath;
    } catch {
      // File doesn't exist, proceed with conversion
      this.logger.info(`Converting audio to WAV: ${inputPath}`);
      try {
        await execAsync(`"${ffmpegPath}" -y -i "${inputPath}" -ar 16000 -ac 1 "${outputPath}"`);
        return outputPath;
      } catch (err) {
        this.logger.error(`Failed to convert ${inputPath} to WAV`, err);
        return null; // Return null if conversion fails so we can skip
      }
    }
  }

  async analyzeAudioFiles({ sessionId, filePaths = [], writeTextReport = false }) {
    const validPaths = (Array.isArray(filePaths) ? filePaths : []).filter(Boolean);
    if (!sessionId) {
      this.logger.warn("PythonAnalysisClient: Missing sessionId or filePaths, skipping audio analysis.");
      return false;
    }

    this.logger.info(`Sending ${validPaths.length} file${validPaths.length === 1 ? "" : "s"} to Python API for audio analysis...`);
    try {
      const audioResponse = await this.fetchImpl(`${this.baseUrl}/analyze-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_paths: validPaths,
          session_id: sessionId,
          merge_with_existing: true,
          write_text_report: writeTextReport,
        })
      });

      if (!audioResponse.ok) {
        const errText = await audioResponse.text();
        this.logger.error(`Audio analysis API failed: ${audioResponse.status} - ${errText}`);
        return false;
      }

      this.logger.info("Audio analysis completed successfully.");
      return true;
    } catch (error) {
      if (this.isConnectionRefused(error)) {
        this.logServiceUnavailable("audio", error);
      } else {
        this.logger.error("Failed to call Python audio analysis API:", error);
      }
      return false;
    }
  }

  async analyzeTranscript({ sessionId, transcriptText = "", qaEvaluations = [] }) {
    if (!sessionId || (!transcriptText && qaEvaluations.length === 0)) {
      this.logger.warn("PythonAnalysisClient: Missing transcript content, skipping transcript analysis.");
      return false;
    }

    this.logger.info("Sending transcript for analysis to Python API...");
    try {
      const transcriptResponse = await this.fetchImpl(`${this.baseUrl}/analyze-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qaPairs: qaEvaluations,
          transcriptText,
          session_id: sessionId
        })
      });

      if (!transcriptResponse.ok) {
        const errText = await transcriptResponse.text();
        this.logger.error(`Transcript analysis API failed: ${transcriptResponse.status} - ${errText}`);
        return false;
      }

      this.logger.info("Transcript analysis completed successfully.");
      return true;
    } catch (error) {
      if (this.isConnectionRefused(error)) {
        this.logServiceUnavailable("transcript", error);
      } else {
        this.logger.error("Failed to call Python transcript analysis API:", error);
      }
      return false;
    }
  }

  async writeTranscriptFallbackArtifact({ sessionDir, transcriptText = "", qaEvaluations = [] }) {
    if (!sessionDir) return;

    const fallbackPayload = {
      status: "skipped",
      reason: "Python transcript service unavailable or transcript analysis failed",
      generatedAt: new Date().toISOString(),
      transcriptText,
      qaPairs: Array.isArray(qaEvaluations) ? qaEvaluations : [],
    };

    try {
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(
        path.join(sessionDir, "transcript_analysis_out.json"),
        `${JSON.stringify(fallbackPayload, null, 2)}\n`,
        "utf8"
      );
    } catch (error) {
      this.logger.warn("Failed to write transcript fallback artifact.", error);
    }
  }

  async analyzeSessionAndTranscript({ sessionId, baseDir, candidateAnswerAudioFiles = [], transcriptText = "", report = null }) {
    if (!sessionId || !baseDir) {
      this.logger.warn("PythonAnalysisClient: Missing sessionId or baseDir, skipping analysis.");
      return;
    }

    const sessionDir = path.join(baseDir, this.buildSessionFolderName(sessionId));

    // 1. Prepare and Convert Audio Files
    const wavPaths = [];
    for (const fileObj of candidateAnswerAudioFiles) {
      if (fileObj.relativePath) {
        const fullPath = path.join(sessionDir, fileObj.relativePath);
        const wavPath = await this.convertToWav(fullPath);
        if (wavPath) {
          wavPaths.push(wavPath);
        }
      }
    }

    // 2. Call /analyze-session one file at a time so incremental item outputs are
    // appended/merged into the session artifact as each answer arrives.
    if (wavPaths.length > 0) {
      for (const wavPath of wavPaths) {
        await this.analyzeAudioFiles({ sessionId, filePaths: [wavPath], writeTextReport: false });
      }
    } else {
      this.logger.info("No new WAV files were available for audio analysis.");
    }

    await this.analyzeAudioFiles({ sessionId, filePaths: [], writeTextReport: true });

    // 3. Call /analyze-transcript
    const qaEvaluations = report?.qaEvaluations || [];
    if (qaEvaluations.length > 0 || transcriptText) {
      const transcriptAnalysisSucceeded = await this.analyzeTranscript({ sessionId, transcriptText, qaEvaluations });
      if (!transcriptAnalysisSucceeded) {
        await this.writeTranscriptFallbackArtifact({ sessionDir, transcriptText, qaEvaluations });
      }
    } else {
      this.logger.warn("No transcript or QA evaluations available. Skipping transcript analysis.");
    }
  }
}
