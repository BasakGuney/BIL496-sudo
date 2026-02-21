import { InterviewSession } from "../../domain/entities/InterviewSession.js";
import { normalizeSessionMode } from "../../domain/entities/SessionMode.js";
import { AppError } from "../../domain/errors/AppError.js";

export class InterviewSessionOrchestrator {
  constructor({ sessionConfigFactory, realtimeGateway, sessionRepository, idGenerator, transcriptEvaluator }) {
    this.sessionConfigFactory = sessionConfigFactory;
    this.realtimeGateway = realtimeGateway;
    this.sessionRepository = sessionRepository;
    this.idGenerator = idGenerator;
    this.transcriptEvaluator = transcriptEvaluator;
  }

  async createInterviewSession({ mode, offerSdp, sessionId }) {
    const normalizedMode = normalizeSessionMode(mode);
    const sessionConfig = this.sessionConfigFactory.create({ mode: normalizedMode });
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

  async createReport({ sessionId, transcript }) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", status: 404 });
    }

    const report = await this.transcriptEvaluator.evaluate({ sessionId, transcript });
    session.report = report;
    this.sessionRepository.update(session);
    return report;
  }
}
