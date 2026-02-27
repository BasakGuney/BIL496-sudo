import { InterviewSession } from "../../domain/entities/InterviewSession.js";
import { normalizeSessionMode } from "../../domain/entities/SessionMode.js";
import { AppError } from "../../domain/errors/AppError.js";

export class InterviewSessionOrchestrator {
  constructor({
    sessionConfigFactory,
    realtimeGateway,
    sessionRepository,
    idGenerator,
    reportArchive = null,
  }) {
    this.sessionConfigFactory = sessionConfigFactory;
    this.realtimeGateway = realtimeGateway;
    this.sessionRepository = sessionRepository;
    this.idGenerator = idGenerator;
    this.reportArchive = reportArchive;
  }

  async createInterviewSession({ mode, offerSdp, sessionId, interviewContext = {} }) {
    const normalizedMode = normalizeSessionMode(mode);
    const sessionConfig = this.sessionConfigFactory.create({
      mode: normalizedMode,
      ...interviewContext,
    });
    const answerSdp = await this.realtimeGateway.createCall({ offerSdp, sessionConfig });

    const session = new InterviewSession({
      id: sessionId || this.idGenerator.newId(),
      mode: normalizedMode,
      offerSdp,
      answerSdp,
    });

    this.sessionRepository.create(session);
    return session;
  }

  normalizeDialogue(transcript) {
    const safeTranscript = Array.isArray(transcript) ? transcript : [];

    return safeTranscript
      .filter((item) => ["interviewer", "candidate", "assistant", "user"].includes(item?.role))
      .map((item) => ({
        role:
          item.role === "assistant"
            ? "interviewer"
            : item.role === "user"
            ? "candidate"
            : item.role,
        text: String(item.text || "").trim(),
        ts: Number(item.ts || Date.now()),
      }))
      .filter((item) => item.text.length > 0)
      .sort((a, b) => a.ts - b.ts);
  }


  normalizeEntry(entry) {
    const normalized = this.normalizeDialogue([entry]);
    return normalized[0] || null;
  }

  async appendDialogueEntry({ sessionId, entry }) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", status: 404 });
    }

    const normalized = this.normalizeEntry(entry);
    if (!normalized) return session.report || { sessionId, createdAt: new Date().toISOString(), dialogue: [] };

    const report = session.report || { sessionId, createdAt: new Date().toISOString(), dialogue: [] };
    const dialogue = Array.isArray(report.dialogue) ? report.dialogue : [];
    const last = dialogue[dialogue.length - 1];
    if (!last || last.role !== normalized.role || last.text !== normalized.text) {
      dialogue.push(normalized);
    }

    session.report = { ...report, dialogue };
    this.sessionRepository.update(session);

    if (this.reportArchive?.save) {
      await this.reportArchive.save({ sessionId, dialogue });
    }

    return session.report;
  }

  async createReport({ sessionId, transcript }) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", status: 404 });
    }

    const incomingDialogue = this.normalizeDialogue(transcript);
    const existingDialogue = Array.isArray(session.report?.dialogue) ? session.report.dialogue : [];
    const dialogue = [...existingDialogue];
    for (const entry of incomingDialogue) {
      const last = dialogue[dialogue.length - 1];
      if (!last || last.role !== entry.role || last.text !== entry.text) dialogue.push(entry);
    }
    const report = {
      sessionId,
      createdAt: session.report?.createdAt || new Date().toISOString(),
      dialogue,
    };

    session.report = report;
    this.sessionRepository.update(session);

    if (this.reportArchive?.save) {
      await this.reportArchive.save({ sessionId, dialogue });
    }

    return report;
  }
}
