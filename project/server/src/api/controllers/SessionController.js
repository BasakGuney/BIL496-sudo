import { SessionConfig } from "../../domain/value-objects/SessionConfig.js";
import { CreateSessionRequest } from "../../dto/requests/CreateSessionRequest.js";
import { StartSessionRequest } from "../../dto/requests/StartSessionRequest.js";
import { SessionView } from "../../dto/responses/views/SessionView.js";
import { TurnView } from "../../dto/responses/views/TurnView.js";

export class SessionController {
  constructor({ backendOrchestrator }) {
    this.backendOrchestrator = backendOrchestrator;
    this.createSession = this.createSession.bind(this);
    this.startSession = this.startSession.bind(this);
    this.updateSessionConfig = this.updateSessionConfig.bind(this);
    this.generatePreviewQuestions = this.generatePreviewQuestions.bind(this);
    this.generateLiveHints = this.generateLiveHints.bind(this);
    this.generateLiveFeedback = this.generateLiveFeedback.bind(this);
    this.recordUsage = this.recordUsage.bind(this);
  }

  async generatePreviewQuestions(req, res, next) {
    try {
      const questions = await this.backendOrchestrator.generatePreviewQuestions(req.body || {});
      return res.json({ questions });
    } catch (error) {
      return next(error);
    }
  }

  async generateLiveHints(req, res, next) {
    try {
      const { question } = req.body;
      if (!question) {
        return res.status(400).json({ error: "question is required" });
      }
      const hints = await this.backendOrchestrator.generateLiveHints(req.params.sessionId, question);
      return res.json({ hints });
    } catch (error) {
      return next(error);
    }
  }

  async generateLiveFeedback(req, res, next) {
    try {
      const { question, answer } = req.body;
      if (!question || !answer) {
        return res.status(400).json({ error: "question and answer are required" });
      }
      const feedback = await this.backendOrchestrator.generateLiveFeedback(req.params.sessionId, question, answer);
      return res.json({ feedback });
    } catch (error) {
      return next(error);
    }
  }

  async recordUsage(req, res, next) {
    try {
      const { kind, usage } = req.body || {};
      if (!kind || !usage) {
        return res.status(400).json({ error: "kind and usage are required" });
      }
      const tokenUsage = await this.backendOrchestrator.recordUsage(req.params.sessionId, kind, usage);
      return res.json({ tokenUsage });
    } catch (error) {
      return next(error);
    }
  }

  async createSession(req, res, next) {
    try {
      const request = CreateSessionRequest.fromExpress(req);
      const cfg = new SessionConfig({
        firstName: request.firstName,
        lastName: request.lastName,
        gender: request.gender,
        interviewType: request.interviewType,
        role: request.role,
        domain: request.domain,
        companyOrIndustry: request.companyOrIndustry,
        difficulty: request.difficulty,
        mode: request.mode,
        cvFile: request.cvFile,
        candidateBrief: request.candidateBrief,
      });

      const session = await this.backendOrchestrator.createSession(cfg, request.offerSdp, request.sessionId);

      if (request.offerSdp) {
        return res.type("application/sdp").send(session.answerSdp);
      }

      return res.json(SessionView.fromSession(session));
    } catch (error) {
      return next(error);
    }
  }

  async startSession(req, res, next) {
    try {
      const request = StartSessionRequest.fromExpress(req);
      const turn = await this.backendOrchestrator.startSession(request.sessionId);
      return res.json(TurnView.fromTurn(turn));
    } catch (error) {
      return next(error);
    }
  }

  async updateSessionConfig(req, res, next) {
    try {
      const request = CreateSessionRequest.fromExpress(req);
      const cfg = new SessionConfig({
        firstName: request.firstName,
        lastName: request.lastName,
        gender: request.gender,
        interviewType: request.interviewType,
        role: request.role,
        domain: request.domain,
        companyOrIndustry: request.companyOrIndustry,
        difficulty: request.difficulty,
        mode: request.mode,
        cvFile: request.cvFile,
        candidateBrief: request.candidateBrief,
      });

      const session = await this.backendOrchestrator.updateSessionConfig(req.params.sessionId, cfg);
      return res.json(SessionView.fromSession(session));
    } catch (error) {
      return next(error);
    }
  }
}
