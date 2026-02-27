import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export class FileReportArchive {
  constructor({ baseDir }) {
    this.baseDir = baseDir;
  }

  sanitizeSessionId(sessionId) {
    return String(sessionId || "unknown-session").replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  async save({ sessionId, dialogue }) {
    await mkdir(this.baseDir, { recursive: true });

    const safeSessionId = this.sanitizeSessionId(sessionId);
    const filename = `${safeSessionId}.json`;
    const fullPath = path.join(this.baseDir, filename);

    const payload = {
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dialogue: Array.isArray(dialogue) ? dialogue : [],
    };

    await writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return fullPath;
  }
}
