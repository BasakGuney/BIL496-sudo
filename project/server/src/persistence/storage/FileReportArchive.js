import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class FileReportArchive {
  constructor({ baseDir }) {
    this.baseDir = baseDir;
  }

  sanitizeSessionId(sessionId) {
    return String(sessionId || "unknown-session").replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  buildSessionFolderName(sessionId) {
    const safeSessionId = this.sanitizeSessionId(sessionId);
    return safeSessionId.startsWith("S-") ? safeSessionId : `S-${safeSessionId}`;
  }

  extensionFromMimeType(mimeType = "") {
    const clean = String(mimeType || "").toLowerCase();
    if (clean.includes("ogg")) return "ogg";
    if (clean.includes("mpeg") || clean.includes("mp3")) return "mp3";
    if (clean.includes("wav")) return "wav";
    if (clean.includes("mp4") || clean.includes("m4a")) return "m4a";
    return "webm";
  }

  normalizeCandidateAnswerAudios(candidateAnswerAudios = []) {
    return (Array.isArray(candidateAnswerAudios) ? candidateAnswerAudios : [])
      .map((item) => ({
        questionIndex: Number(item?.questionIndex || 0),
        mimeType: String(item?.mimeType || "audio/webm"),
        startedAt: Number(item?.startedAt || Date.now()),
        endedAt: Number(item?.endedAt || Date.now()),
        audioBase64: String(item?.audioBase64 || ""),
      }))
      .filter((item) => item.questionIndex > 0 && item.audioBase64.length > 0);
  }

  normalizeVisionAnalysis(visionAnalysis = null) {
    if (!visionAnalysis || typeof visionAnalysis !== "object") return null;

    const samples = (Array.isArray(visionAnalysis.samples) ? visionAnalysis.samples : [])
      .map((sample, index) => ({
        index: index + 1,
        ts: Number(sample?.ts || 0),
        frameIndex: Number(sample?.frameIndex || 0),
        hasFace: Boolean(sample?.hasFace),
        bbox: sample?.bbox && typeof sample.bbox === "object"
          ? {
              x: Number(sample.bbox.x || 0),
              y: Number(sample.bbox.y || 0),
              width: Number(sample.bbox.width || 0),
              height: Number(sample.bbox.height || 0),
            }
          : null,
        attentionLevel: String(sample?.attentionLevel || "ok"),
        imageBase64: String(sample?.imageBase64 || ""),
      }));

    return {
      status: String(visionAnalysis.status || "unavailable"),
      source: String(visionAnalysis.source || "browser-face-detector"),
      supportiveOverlayUsed: Boolean(visionAnalysis.supportiveOverlayUsed),
      overview: {
        sampledFrames: Number(visionAnalysis?.overview?.sampledFrames || 0),
        faceDetectedFrames: Number(visionAnalysis?.overview?.faceDetectedFrames || 0),
        missingFaceFrames: Number(visionAnalysis?.overview?.missingFaceFrames || 0),
        savedSampleCount: Number(visionAnalysis?.overview?.savedSampleCount || samples.length || 0),
        facePresenceRatio: Number(visionAnalysis?.overview?.facePresenceRatio || 0),
        facePresenceScore: Number(visionAnalysis?.overview?.facePresenceScore || 0),
        focusScore: Number(visionAnalysis?.overview?.focusScore || 0),
        centeringScore: Number(visionAnalysis?.overview?.centeringScore || 0),
        steadinessScore: Number(visionAnalysis?.overview?.steadinessScore || 0),
        averageFaceAreaRatio: Number(visionAnalysis?.overview?.averageFaceAreaRatio || 0),
        averageCenterOffset: Number(visionAnalysis?.overview?.averageCenterOffset || 0),
        headMovementRaw: Number(visionAnalysis?.overview?.headMovementRaw || 0),
      },
      tension: {
        visualTensionScore: Number(visionAnalysis?.tension?.visualTensionScore || 0),
        attentionRiskScore: Number(visionAnalysis?.tension?.attentionRiskScore || 0),
        movementRiskScore: Number(visionAnalysis?.tension?.movementRiskScore || 0),
        eyeTensionScore: Number(visionAnalysis?.tension?.eyeTensionScore || 0),
        attentionDriftRatio: Number(visionAnalysis?.tension?.attentionDriftRatio || 0),
        dangerFrameRatio: Number(visionAnalysis?.tension?.dangerFrameRatio || 0),
        lowEyeRatio: Number(visionAnalysis?.tension?.lowEyeRatio || 0),
        warnFrames: Number(visionAnalysis?.tension?.warnFrames || 0),
        dangerFrames: Number(visionAnalysis?.tension?.dangerFrames || 0),
        lowEyeFrames: Number(visionAnalysis?.tension?.lowEyeFrames || 0),
      },
      diagnostics: visionAnalysis?.diagnostics && typeof visionAnalysis.diagnostics === "object"
        ? {
            detector: visionAnalysis.diagnostics.detector || null,
            lastSource: String(visionAnalysis.diagnostics.lastSource || ""),
            savedSampleCount: Number(visionAnalysis.diagnostics.savedSampleCount || samples.length || 0),
          }
        : {
            detector: null,
            lastSource: String(visionAnalysis.source || ""),
            savedSampleCount: samples.length,
          },
      samples,
      capturedAt: String(visionAnalysis.capturedAt || new Date().toISOString()),
    };
  }

  buildAnswerFileName(answer = {}, sequence = null) {
    const ext = this.extensionFromMimeType(answer?.mimeType);
    const index = Number(sequence || 1);
    return `answer_${String(index).padStart(2, "0")}.${ext}`;
  }

  async ensureSessionDir(sessionId) {
    await mkdir(this.baseDir, { recursive: true });
    const sessionDir = path.join(this.baseDir, this.buildSessionFolderName(sessionId));
    await mkdir(sessionDir, { recursive: true });
    return sessionDir;
  }

  async saveIncrementalCandidateAnswerAudio({ sessionId, candidateAnswerAudio }) {
    const normalized = this.normalizeCandidateAnswerAudios([candidateAnswerAudio]);
    const answer = normalized[0] || null;
    if (!answer) return null;

    const sessionDir = await this.ensureSessionDir(sessionId);
    const answersDir = path.join(sessionDir, "candidate-answers");
    await mkdir(answersDir, { recursive: true });

    const nextSequence = await this.getNextAnswerSequence(answersDir);
    const fileName = this.buildAnswerFileName(answer, nextSequence);
    const fullPath = path.join(answersDir, fileName);
    const audioBuffer = Buffer.from(answer.audioBase64, "base64");
    if (audioBuffer.length === 0) return null;

    await writeFile(fullPath, audioBuffer);
    return {
      questionIndex: answer.questionIndex,
      mimeType: answer.mimeType,
      startedAt: answer.startedAt,
      endedAt: answer.endedAt,
      fileName,
      relativePath: path.join("candidate-answers", fileName),
      fullPath,
    };
  }

  async getNextAnswerSequence(answersDir) {
    const files = await readdir(answersDir, { withFileTypes: true }).catch(() => []);
    let maxSequence = 0;

    for (const file of files) {
      if (!file?.isFile?.()) continue;
      const match = /^answer_(\d+)\./i.exec(file.name);
      if (!match) continue;
      maxSequence = Math.max(maxSequence, Number(match[1] || 0));
    }

    return maxSequence + 1;
  }

  buildSavedAudioKey(item = {}) {
    return [item?.questionIndex, item?.startedAt, item?.endedAt].join(":");
  }

  async saveCandidateAnswerAudioFiles({ sessionDir, candidateAnswerAudios, startSequence = 1 }) {
    const normalized = this.normalizeCandidateAnswerAudios(candidateAnswerAudios);
    if (normalized.length === 0) return [];

    const answersDir = path.join(sessionDir, "candidate-answers");
    await mkdir(answersDir, { recursive: true });

    const sorted = [...normalized].sort((a, b) => a.startedAt - b.startedAt);
    const saved = [];
    let seq = startSequence;

    for (const answer of sorted) {
      const fileName = this.buildAnswerFileName(answer, seq);
      const fullPath = path.join(answersDir, fileName);

      const audioBuffer = Buffer.from(answer.audioBase64, "base64");
      if (audioBuffer.length === 0) continue;
      await writeFile(fullPath, audioBuffer);
      saved.push({
        questionIndex: answer.questionIndex,
        mimeType: answer.mimeType,
        startedAt: answer.startedAt,
        endedAt: answer.endedAt,
        fileName,
        relativePath: path.join("candidate-answers", fileName),
      });
      seq++;
    }

    return saved;
  }

  buildTranscriptEntries({ transcript, report }) {
    const direct = Array.isArray(transcript) ? transcript : [];
    const cleanedDirect = direct
      .map((item) => ({
        role: item?.role === "interviewer" ? "interviewer" : "candidate",
        text: String(item?.text || "").trim(),
        ts: Number(item?.ts || Date.now()),
        source: String(item?.source || "").trim(),
        model: String(item?.model || "").trim(),
      }))
      .filter((item) => item.text.length > 0);

    if (cleanedDirect.length > 0) return cleanedDirect;

    const qa = Array.isArray(report?.qaEvaluations) ? report.qaEvaluations : [];
    const fromQa = [];
    for (const row of qa) {
      const question = String(row?.question || "").trim();
      const answer = String(row?.answer || "").trim();
      if (question) fromQa.push({ role: "interviewer", text: question, ts: Date.now() });
      if (answer) fromQa.push({ role: "candidate", text: answer, ts: Date.now() });
    }

    return fromQa;
  }

  mergeSavedAudioFiles(existingFiles = [], newFiles = []) {
    const out = [];
    const seen = new Set();

    for (const file of [...existingFiles, ...newFiles]) {
      const key = [file?.questionIndex, file?.startedAt, file?.endedAt, file?.relativePath].join(":");
      if (!file?.relativePath || seen.has(key)) continue;
      seen.add(key);
      out.push(file);
    }

    return out.sort((a, b) => Number(a?.startedAt || 0) - Number(b?.startedAt || 0));
  }

  async saveVisionAnalysisArtifacts({ sessionDir, visionAnalysis = null }) {
    const normalized = this.normalizeVisionAnalysis(visionAnalysis);
    if (!normalized) return null;

    const analysisDir = path.join(sessionDir, "vision");
    const samplesDir = path.join(analysisDir, "samples");
    await mkdir(samplesDir, { recursive: true });

    const savedSamples = [];
    for (const sample of normalized.samples) {
      let relativeImagePath = null;
      if (sample.imageBase64) {
        const fileName = `frame_${String(sample.index).padStart(2, "0")}.jpg`;
        const fullPath = path.join(samplesDir, fileName);
        const imageBuffer = Buffer.from(sample.imageBase64, "base64");
        if (imageBuffer.length > 0) {
          await writeFile(fullPath, imageBuffer);
          relativeImagePath = path.join("vision", "samples", fileName);
        }
      }

      savedSamples.push({
        ...sample,
        imageBase64: undefined,
        imagePath: relativeImagePath,
      });
    }

    const payload = {
      ...normalized,
      samples: savedSamples,
    };

    const relativePath = path.join("vision", "vision_analysis_out.json");
    await writeFile(path.join(sessionDir, relativePath), `${JSON.stringify(payload, null, 2)}
`, "utf8");
    return {
      ...payload,
      relativePath,
    };
  }

  async readJsonIfExists(filePath) {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async readTextIfExists(filePath) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      return "";
    }
  }

  buildScoreMeta() {
    return {
      overall: { label: "Genel Skor", min: 0, max: 100 },
      audio: {
        label: "Ses Skorları",
        items: {
          overallClarity: { label: "Ses Netliği", min: 0, max: 100 },
        },
      },
      vision: {
        label: "Görüntü Skorları",
        items: {
          facePresenceScore: { label: "Yüz Görünürlüğü", min: 0, max: 100 },
          focusScore: { label: "Odak", min: 0, max: 100 },
          centeringScore: { label: "Kadraj", min: 0, max: 100 },
          steadinessScore: { label: "Stabilite", min: 0, max: 100 },
          visualTensionScore: { label: "Görsel Gerginlik", min: 0, max: 100, inverted: true },
          attentionRiskScore: { label: "Dikkat Riski", min: 0, max: 100, inverted: true },
          movementRiskScore: { label: "Hareket Riski", min: 0, max: 100, inverted: true },
          eyeTensionScore: { label: "Göz Teması Riski", min: 0, max: 100, inverted: true },
        },
      },
    };
  }

  async loadFeedbackArtifacts(sessionId) {
    const sessionDir = await this.ensureSessionDir(sessionId);
    const visionDir = path.join(sessionDir, "vision");
    const [audioModel, transcriptAnalysis, visionAnalysis, visionLlmAnalysis, audioLlmReport, transcriptText] = await Promise.all([
      this.readJsonIfExists(path.join(sessionDir, "audio_model_out.json")),
      this.readJsonIfExists(path.join(sessionDir, "transcript_analysis_out.json")),
      this.readJsonIfExists(path.join(visionDir, "vision_analysis_out.json")),
      this.readJsonIfExists(path.join(visionDir, "vision_llm_analysis_out.json")),
      this.readTextIfExists(path.join(sessionDir, "audio_analysis_out.txt")),
      this.readTextIfExists(path.join(sessionDir, "transcript.txt")),
    ]);

    return {
      transcriptText: String(transcriptText || "").trim(),
      audioModel,
      audioLlmReport: String(audioLlmReport || "").trim(),
      transcriptAnalysis,
      visionAnalysis,
      visionLlmAnalysis,
      scoreMeta: this.buildScoreMeta(),
    };
  }

  async save({ sessionId, transcript, report, candidateAnswerAudios = [], existingCandidateAnswerAudioFiles = [], visionAnalysis = null }) {
    const sessionDir = await this.ensureSessionDir(sessionId);
    const transcriptEntries = this.buildTranscriptEntries({ transcript, report });
    const transcriptTextPath = path.join(sessionDir, `transcript.txt`);

    const transcriptText = transcriptEntries
      .map((item) => {
        const role = item?.role === "interviewer" ? "Interviewer" : "Candidate";
        return `[${role}] ${String(item?.text || "").trim()}`;
      })
      .filter(Boolean)
      .join("\n");

    const existingKeys = new Set(existingCandidateAnswerAudioFiles.map((item) => this.buildSavedAudioKey(item)));
    const unsavedCandidateAnswerAudios = this.normalizeCandidateAnswerAudios(candidateAnswerAudios).filter(
      (item) => !existingKeys.has(this.buildSavedAudioKey(item))
    );

    const newlySavedCandidateAnswerAudioFiles = await this.saveCandidateAnswerAudioFiles({
      sessionDir,
      candidateAnswerAudios: unsavedCandidateAnswerAudios,
      startSequence: existingCandidateAnswerAudioFiles.length + 1,
    });
    const savedCandidateAnswerAudioFiles = this.mergeSavedAudioFiles(
      existingCandidateAnswerAudioFiles,
      newlySavedCandidateAnswerAudioFiles
    );

    const visionArtifacts = await this.saveVisionAnalysisArtifacts({ sessionDir, visionAnalysis });

    const safeTranscriptText = transcriptText || "[Interviewer] (metin kaydı alınamadı)";
    await writeFile(transcriptTextPath, `${safeTranscriptText}
`, "utf8");
    return {
      savedCandidateAnswerAudioFiles,
      sessionDir,
      transcriptText,
      visionArtifacts,
    };
  }
}
