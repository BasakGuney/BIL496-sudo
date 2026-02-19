import { InterviewSession } from "../../domain/entities/InterviewSession.js";
import { normalizeSessionMode } from "../../domain/entities/SessionMode.js";

export class InterviewSessionOrchestrator {
  constructor({ sessionConfigFactory, realtimeGateway, sessionRepository, idGenerator }) {
    this.sessionConfigFactory = sessionConfigFactory;
    this.realtimeGateway = realtimeGateway;
    this.sessionRepository = sessionRepository;
    this.idGenerator = idGenerator;
  }

  async createInterviewSession({ mode, offerSdp }) {
    const normalizedMode = normalizeSessionMode(mode);
    const sessionConfig = this.sessionConfigFactory.create({ mode: normalizedMode });
    const answerSdp = await this.realtimeGateway.createCall({ offerSdp, sessionConfig });

    const session = new InterviewSession({
      id: this.idGenerator.newId(),
      mode: normalizedMode,
      offerSdp,
      answerSdp,
    });

    this.sessionRepository.create(session);
    return session;
  }
}
