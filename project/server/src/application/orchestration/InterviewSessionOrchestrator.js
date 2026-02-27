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
      .filter((item) => item?.role === "interviewer" || item?.role === "candidate")
      .map((item) => ({
        role: item.role,
        text: String(item.text || "").trim(),
        ts: Number(item.ts || Date.now()),
      }))
      .filter((item) => item.text.length > 0)
      .sort((a, b) => a.ts - b.ts);
  }

  async createReport({ sessionId, transcript }) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", status: 404 });
    }

    const dialogue = this.normalizeDialogue(transcript);
    const report = {
      sessionId,
      createdAt: new Date().toISOString(),
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
