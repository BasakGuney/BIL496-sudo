import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export class FileReportArchive {
  constructor({ baseDir }) {
    this.baseDir = baseDir;
  }

  sanitizeSessionId(sessionId) {
    return String(sessionId || "unknown-session").replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  async save({ sessionId, transcript, report }) {
    await mkdir(this.baseDir, { recursive: true });

    const safeSessionId = this.sanitizeSessionId(sessionId);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const transcriptEntries = Array.isArray(transcript) ? transcript : [];
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
    await writeFile(transcriptTextPath, `${transcriptText}\n`, "utf8");
    return fullPath;
  }
}
