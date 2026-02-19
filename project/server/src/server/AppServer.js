import express from "express";
import cors from "cors";
import { getEnv } from "../config/env.js";
import { Logger } from "../utils/Logger.js";
import { IdGenerator } from "../utils/IdGenerator.js";
import { InMemorySessionRepository } from "../persistence/InMemorySessionRepository.js";
import { InMemoryReportRepository } from "../persistence/InMemoryReportRepository.js";
import { OpenAIClientAdapter } from "../application/services/ai/OpenAIClientAdapter.js";
import { PromptTemplates } from "../application/services/ai/PromptTemplates.js";
import { AIServiceGateway } from "../application/services/ai/AIServiceGateway.js";
import { AudioSignalProcessor } from "../application/services/analysis/AudioSignalProcessor.js";
import { VisionSignalProcessor } from "../application/services/analysis/VisionSignalProcessor.js";
import { SignalAggregator } from "../application/services/analysis/SignalAggregator.js";
import { BehaviorAnalyzer } from "../application/services/analysis/BehaviorAnalyzer.js";
import { InterviewFlowPolicy } from "../application/orchestration/InterviewFlowPolicy.js";
import { GuardrailsEngine } from "../application/orchestration/GuardrailsEngine.js";
import { BackendOrchestrator } from "../application/orchestration/BackendOrchestrator.js";
import { TurnDetectionPolicy } from "../application/services/realtime/TurnDetectionPolicy.js";
import { SessionUpdateBuilder } from "../application/services/realtime/SessionUpdateBuilder.js";
import { RealtimeSessionManager } from "../application/services/realtime/RealtimeSessionManager.js";
import { SessionController } from "../api/controllers/SessionController.js";
import { ConsentController } from "../api/controllers/ConsentController.js";
import { RealtimeController } from "../api/controllers/RealtimeController.js";
import { ReportController } from "../api/controllers/ReportController.js";
import { ErrorHandlerMiddleware } from "../api/middleware/ErrorHandlerMiddleware.js";
import { createRoutes } from "../api/routes/routes.js";

export class AppServer {
  constructor({ env = getEnv(), logger = new Logger() } = {}) {
    this.env = env;
    this.logger = logger;
    this.app = express();

    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.text({ type: ["application/sdp", "text/plain"] }));

    const idGenerator = new IdGenerator();
    const sessions = new InMemorySessionRepository();
    const reports = new InMemoryReportRepository();
    const openai = new OpenAIClientAdapter({ apiKey: env.openAiApiKey });
    const ai = new AIServiceGateway(openai, new PromptTemplates());
    const analyzer = new BehaviorAnalyzer(new AudioSignalProcessor(), new VisionSignalProcessor(), new SignalAggregator());
    const guardrails = new GuardrailsEngine(new InterviewFlowPolicy());
    const orchestrator = new BackendOrchestrator({ sessions, reports, ai, analyzer, guardrails, idGenerator });
    const realtime = new RealtimeSessionManager(openai, new SessionUpdateBuilder(new TurnDetectionPolicy()));

    this.app.use(createRoutes({
      sessionController: new SessionController(orchestrator),
      consentController: new ConsentController(orchestrator),
      realtimeController: new RealtimeController(realtime, orchestrator),
      reportController: new ReportController(orchestrator),
    }));

    const errorHandler = new ErrorHandlerMiddleware();
    this.app.use((err, req, res, next) => errorHandler.handle(err, req, res, next));
  }

  listen() {
    this.app.listen(this.env.port, () => {
      this.logger.info(`Server listening on http://localhost:${this.env.port}`);
    });
  }
}
