import path from "node:path";
import express from "express";
import cors from "cors";
import { getEnv } from "../config/env.js";
import { OpenAiRealtimeGateway } from "../services/ai/OpenAiRealtimeGateway.js";
import { InMemorySessionRepository } from "../persistence/storage/InMemorySessionRepository.js";
import { InMemoryReportRepository } from "../persistence/storage/InMemoryReportRepository.js";
import { IdGenerator } from "../utils/IdGenerator.js";
import { Logger } from "../utils/Logger.js";
import { SessionController } from "../api/controllers/SessionController.js";
import { ConsentController } from "../api/controllers/ConsentController.js";
import { RealtimeController } from "../api/controllers/RealtimeController.js";
import { ReportController } from "../api/controllers/ReportController.js";
import { createSessionRouter } from "../api/routes/sessionRoutes.js";
import { ErrorHandlerMiddleware } from "../api/middleware/ErrorHandlerMiddleware.js";
import { TranscriptEvaluator } from "../services/analysis/TranscriptEvaluator.js";
import { FileReportArchive } from "../persistence/storage/FileReportArchive.js";
import { OpenAIClientAdapter } from "../services/ai/OpenAIClientAdapter.js";
import { PromptTemplates } from "../services/ai/PromptTemplates.js";
import { AIServiceGateway } from "../services/ai/AIServiceGateway.js";
import { TurnDetectionPolicy } from "../services/realtime/TurnDetectionPolicy.js";
import { SessionUpdateBuilder } from "../services/realtime/SessionUpdateBuilder.js";
import { RealtimeSessionManager } from "../services/realtime/RealtimeSessionManager.js";
import { AudioSignalProcessor } from "../services/analysis/AudioSignalProcessor.js";
import { VisionSignalProcessor } from "../services/analysis/VisionSignalProcessor.js";
import { SignalAggregator } from "../services/analysis/SignalAggregator.js";
import { BehaviorAnalyzer } from "../services/analysis/BehaviorAnalyzer.js";
import { InterviewFlowPolicy } from "../orchestration/InterviewFlowPolicy.js";
import { GuardrailsEngine } from "../orchestration/GuardrailsEngine.js";
import { BackendOrchestrator } from "../orchestration/BackendOrchestrator.js";

export class AppServer {
  constructor({ env = getEnv(), logger = new Logger() } = {}) {
    this.env = env;
    this.logger = logger;
    this.app = express();

    this.app.use(cors());
    this.app.use(express.text({ type: ["application/sdp", "text/plain"] }));
    this.app.use(express.json({ limit: "50mb" }));

    this.app.use((req, res, next) => {
      this.logger.info(`[API] ${req.method} ${req.url}`);
      next();
    });

    // Backward-compatible client log endpoint.
    // Some clients may still post transient RTC/debug events to /log.
    this.app.post("/log", (req, res) => {
      this.logger.info("[CLIENT_LOG]", req.body ?? null);
      res.status(204).send();
    });

    const openAiGateway = new OpenAiRealtimeGateway({ apiKey: this.env.openAiApiKey });
    const openAiClient = new OpenAIClientAdapter({ realtimeGateway: openAiGateway, apiKey: this.env.openAiApiKey });

    const prompts = new PromptTemplates();
    const ai = new AIServiceGateway({ client: openAiClient, prompts });

    const turnPolicy = new TurnDetectionPolicy();
    const sessionBuilder = new SessionUpdateBuilder({ turnPolicy, promptTemplates: prompts });
    const realtimeManager = new RealtimeSessionManager({ openai: openAiClient, builder: sessionBuilder });

    const transcriptEvaluator = new TranscriptEvaluator({
      apiKey: this.env.openAiApiKey,
      promptTemplates: prompts,
    });
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

    const sessionController = new SessionController({ backendOrchestrator });
    const consentController = new ConsentController({ backendOrchestrator });
    const realtimeController = new RealtimeController({ backendOrchestrator });
    const reportController = new ReportController({ backendOrchestrator });

    this.app.use(
      createSessionRouter({
        sessionController,
        consentController,
        realtimeController,
        reportController,
      })
    );

    const errorHandler = new ErrorHandlerMiddleware({ logger: this.logger });
    this.app.use(errorHandler.handle);
  }

  listen() {
    const maxRetries = 10;

    const start = (port, attempt = 0) => {
      const server = this.app.listen(port, () => {
        this.logger.info(`Realtime server listening on http://localhost:${port}`);
      });

      server.on("error", (error) => {
        if (error?.code === "EADDRINUSE" && attempt < maxRetries) {
          const nextPort = port + 1;
          this.logger.warn(
            `Port ${port} is already in use. Retrying with port ${nextPort}...`,
            null
          );
          setTimeout(() => start(nextPort, attempt + 1), 50);
          return;
        }

        if (error?.code === "EADDRINUSE") {
          this.logger.error(
            `Failed to start server: ports ${this.env.port}-${this.env.port + maxRetries} are busy.`,
            error
          );
          process.exitCode = 1;
          return;
        }

        this.logger.error("Server listen error", error);
        process.exitCode = 1;
      });

      return server;
    };

    return start(this.env.port, 0);
  }
}
