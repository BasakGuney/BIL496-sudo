import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";

const execAsync = promisify(exec);

export class PythonAnalysisClient {
  constructor({ baseUrl = "http://localhost:8001", fetchImpl = fetch, logger = console } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
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

  async analyzeSessionAndTranscript({ sessionId, baseDir, candidateAnswerAudioFiles = [], transcriptText = "", report = null }) {
    if (!sessionId || !baseDir) {
      this.logger.warn("PythonAnalysisClient: Missing sessionId or baseDir, skipping analysis.");
      return;
    }

    const sessionDir = path.join(baseDir, sessionId);

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

    // 2. Call /analyze-session (Audio Analysis)
    if (wavPaths.length > 0) {
      this.logger.info(`Sending ${wavPaths.length} files to Python API for audio analysis...`);
      try {
        const audioResponse = await this.fetchImpl(`${this.baseUrl}/analyze-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_paths: wavPaths,
            session_id: sessionId
          })
        });

        if (!audioResponse.ok) {
          const errText = await audioResponse.text();
          this.logger.error(`Audio analysis API failed: ${audioResponse.status} - ${errText}`);
        } else {
          this.logger.info("Audio analysis completed successfully.");
        }
      } catch (error) {
        this.logger.error("Failed to call Python audio analysis API:", error);
      }
    } else {
      this.logger.warn("No WAV files generated or available. Skipping audio analysis.");
    }

    // 3. Call /analyze-transcript
    const qaEvaluations = report?.qaEvaluations || [];
    if (qaEvaluations.length > 0 || transcriptText) {
      this.logger.info("Sending transcript for analysis to Python API...");
      try {
        const transcriptResponse = await this.fetchImpl(`${this.baseUrl}/analyze-transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qaPairs: qaEvaluations,
            transcriptText: transcriptText,
            session_id: sessionId
          })
        });

        if (!transcriptResponse.ok) {
          const errText = await transcriptResponse.text();
          this.logger.error(`Transcript analysis API failed: ${transcriptResponse.status} - ${errText}`);
        } else {
          this.logger.info("Transcript analysis completed successfully.");
        }
      } catch (error) {
        this.logger.error("Failed to call Python transcript analysis API:", error);
      }
    } else {
      this.logger.warn("No transcript or QA evaluations available. Skipping transcript analysis.");
    }
  }
}
