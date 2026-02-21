import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export class FileReportArchive {
  constructor({ baseDir }) {
    this.baseDir = baseDir;
  }

  sanitizeSessionId(sessionId) {
    return String(sessionId || "unknown-session").replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  buildTranscriptEntries({ transcript, report }) {
    const direct = Array.isArray(transcript) ? transcript : [];
    const cleanedDirect = direct
      .map((item) => ({
        role: item?.role === "interviewer" ? "interviewer" : "candidate",
        text: String(item?.text || "").trim(),
        ts: Number(item?.ts || Date.now()),
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


  async save({ sessionId, transcript, report }) {
    await mkdir(this.baseDir, { recursive: true });

    const safeSessionId = this.sanitizeSessionId(sessionId);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const transcriptEntries = this.buildTranscriptEntries({ transcript, report });
    const filename = `${safeSessionId}-${stamp}.json`;
    const fullPath = path.join(this.baseDir, filename);
    const transcriptTextPath = path.join(this.baseDir, `${safeSessionId}-${stamp}.transcript.txt`);

    const transcriptText = transcriptEntries
      .map((item) => {
        const role = item?.role === "interviewer" ? "Interviewer" : "Candidate";
        return `[${role}] ${String(item?.text || "").trim()}`;
      })
      .filter(Boolean)
      .join("\n");

    const payload = {
      sessionId,
      createdAt: new Date().toISOString(),
      transcript: transcriptEntries,
      transcriptText,
      report,
    };

    await writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    const safeTranscriptText = transcriptText || "[Interviewer] (metin kaydı alınamadı)";
    await writeFile(transcriptTextPath, `${safeTranscriptText}\n`, "utf8");
    return fullPath;
  }
}
