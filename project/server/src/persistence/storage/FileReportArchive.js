import { mkdir, readdir, writeFile } from "node:fs/promises";
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

  async save({ sessionId, transcript, report, candidateAnswerAudios = [], existingCandidateAnswerAudioFiles = [] }) {
    const sessionDir = await this.ensureSessionDir(sessionId);
    const transcriptEntries = this.buildTranscriptEntries({ transcript, report });
    const filename = `report.json`;
    const fullPath = path.join(sessionDir, filename);
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

    const payload = {
      sessionId,
      createdAt: new Date().toISOString(),
      transcript: transcriptEntries,
      transcriptText,
      candidateAnswerAudioFiles: savedCandidateAnswerAudioFiles,
      report,
    };

    await writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    const safeTranscriptText = transcriptText || "[Interviewer] (metin kaydı alınamadı)";
    await writeFile(transcriptTextPath, `${safeTranscriptText}\n`, "utf8");
    return {
      fullPath,
      savedCandidateAnswerAudioFiles,
      sessionDir,
      transcriptText
    };
  }
}
