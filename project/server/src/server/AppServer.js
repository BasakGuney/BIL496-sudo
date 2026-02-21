import path from "node:path";
import express from "express";
import cors from "cors";
import { getEnv } from "../config/env.js";
import { OpenAiRealtimeGateway } from "../infrastructure/gateways/OpenAiRealtimeGateway.js";
import { InMemorySessionRepository } from "../infrastructure/persistence/InMemorySessionRepository.js";
import { InMemoryReportRepository } from "../infrastructure/persistence/InMemoryReportRepository.js";
import { IdGenerator } from "../utils/IdGenerator.js";
import { Logger } from "../utils/Logger.js";
import { SessionController } from "../api/controllers/SessionController.js";
import { createSessionRouter } from "../api/routes/sessionRoutes.js";
import { TranscriptEvaluator } from "../application/services/TranscriptEvaluator.js";
import { FileReportArchive } from "../infrastructure/persistence/FileReportArchive.js";
import { OpenAIClientAdapter } from "../application/services/ai/OpenAIClientAdapter.js";
import { PromptTemplates } from "../application/services/ai/PromptTemplates.js";
import { AIServiceGateway } from "../application/services/ai/AIServiceGateway.js";
import { TurnDetectionPolicy } from "../application/services/realtime/TurnDetectionPolicy.js";
import { SessionUpdateBuilder } from "../application/services/realtime/SessionUpdateBuilder.js";
import { RealtimeSessionManager } from "../application/services/realtime/RealtimeSessionManager.js";
import { AudioSignalProcessor } from "../application/services/analysis/AudioSignalProcessor.js";
import { VisionSignalProcessor } from "../application/services/analysis/VisionSignalProcessor.js";
import { SignalAggregator } from "../application/services/analysis/SignalAggregator.js";
import { BehaviorAnalyzer } from "../application/services/analysis/BehaviorAnalyzer.js";
import { InterviewFlowPolicy } from "../application/policies/InterviewFlowPolicy.js";
import { GuardrailsEngine } from "../application/policies/GuardrailsEngine.js";
import { BackendOrchestrator } from "../application/orchestration/BackendOrchestrator.js";

export class AppServer {
  constructor({ env = getEnv(), logger = new Logger() } = {}) {
    this.env = env;
    this.logger = logger;
    this.app = express();

    this.app.use(cors());
    this.app.use(express.text({ type: ["application/sdp", "text/plain"] }));
    this.app.use(express.json());

    const openAiGateway = new OpenAiRealtimeGateway({ apiKey: this.env.openAiApiKey });
    const openAiClient = new OpenAIClientAdapter({
      realtimeGateway: openAiGateway,
      apiKey: this.env.openAiApiKey,
    });

    const prompts = new PromptTemplates();
    const ai = new AIServiceGateway({ client: openAiClient, prompts });

    const turnPolicy = new TurnDetectionPolicy();
    const sessionBuilder = new SessionUpdateBuilder({ turnPolicy, promptTemplates: prompts });
    const realtimeManager = new RealtimeSessionManager({ openai: openAiClient, builder: sessionBuilder });

    const transcriptEvaluator = new TranscriptEvaluator({ apiKey: this.env.openAiApiKey });
    const analyzer = new BehaviorAnalyzer({
      audioSignalProcessor: new AudioSignalProcessor(),
      visionSignalProcessor: new VisionSignalProcessor(),
      signalAggregator: new SignalAggregator(),
      transcriptEvaluator,
    });

    const sessions = new InMemorySessionRepository();
    const reports = new InMemoryReportRepository();
    const guardrails = new GuardrailsEngine({ policy: new InterviewFlowPolicy() });
    const idGenerator = new IdGenerator();
    const reportArchive = new FileReportArchive({
      baseDir: this.env.reportsDir || path.resolve(process.cwd(), "reports"),
    });

    const backendOrchestrator = new BackendOrchestrator({
      sessions,
      reports,
      ai,
      analyzer,
      guardrails,
      realtimeManager,
      idGenerator,
      reportArchive,
    });

    const sessionController = new SessionController({ backendOrchestrator, logger: this.logger });
    this.app.use(createSessionRouter({ sessionController }));
  }

  listen() {
    this.app.listen(this.env.port, () => {
      this.logger.info(`Realtime server listening on http://localhost:${this.env.port}`);
    });
  }
}
