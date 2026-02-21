import express from "express";
import cors from "cors";
import { getEnv } from "../config/env.js";
import { SessionConfigFactory } from "../application/services/SessionConfigFactory.js";
import { OpenAiRealtimeGateway } from "../infrastructure/gateways/OpenAiRealtimeGateway.js";
import { InMemorySessionRepository } from "../infrastructure/persistence/InMemorySessionRepository.js";
import { IdGenerator } from "../utils/IdGenerator.js";
import { Logger } from "../utils/Logger.js";
import { InterviewSessionOrchestrator } from "../application/orchestration/InterviewSessionOrchestrator.js";
import { SessionController } from "../api/controllers/SessionController.js";
import { createSessionRouter } from "../api/routes/sessionRoutes.js";
import { TranscriptEvaluator } from "../application/services/TranscriptEvaluator.js";

export class AppServer {
  constructor({ env = getEnv(), logger = new Logger() } = {}) {
    this.env = env;
    this.logger = logger;
    this.app = express();

    this.app.use(cors());
    this.app.use(express.text({ type: ["application/sdp", "text/plain"] }));
    this.app.use(express.json());

    const sessionConfigFactory = new SessionConfigFactory();
    const realtimeGateway = new OpenAiRealtimeGateway({ apiKey: this.env.openAiApiKey });
    const sessionRepository = new InMemorySessionRepository();
    const idGenerator = new IdGenerator();
    const transcriptEvaluator = new TranscriptEvaluator({ apiKey: this.env.openAiApiKey });

    const interviewSessionOrchestrator = new InterviewSessionOrchestrator({
      sessionConfigFactory,
      realtimeGateway,
      sessionRepository,
      idGenerator,
      transcriptEvaluator,
    });

    const sessionController = new SessionController({
      interviewSessionOrchestrator,
      logger: this.logger,
    });

    this.app.use(createSessionRouter({ sessionController }));
  }

  listen() {
    this.app.listen(this.env.port, () => {
      this.logger.info(`Realtime server listening on http://localhost:${this.env.port}`);
    });
  }
}
