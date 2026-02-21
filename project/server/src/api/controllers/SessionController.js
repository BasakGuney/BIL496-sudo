import { AppError } from "../../domain/errors/AppError.js";
import { SessionConfig } from "../../domain/value-objects/SessionConfig.js";
import { CreateSessionRequest } from "../requests/CreateSessionRequest.js";
import { UpdateConsentRequest } from "../requests/UpdateConsentRequest.js";
import { StartSessionRequest } from "../requests/StartSessionRequest.js";
import { EndSessionRequest } from "../requests/EndSessionRequest.js";
import { SessionCreatedResponse } from "../responses/SessionCreatedResponse.js";

export class SessionController {
  constructor({ backendOrchestrator, logger }) {
    this.backendOrchestrator = backendOrchestrator;
    this.logger = logger;
    this.createSession = this.createSession.bind(this);
    this.updateConsent = this.updateConsent.bind(this);
    this.startSession = this.startSession.bind(this);
    this.endSession = this.endSession.bind(this);
    this.getReport = this.getReport.bind(this);
    this.createReport = this.createReport.bind(this);
  }

  async createSession(req, res) {
    try {
      const request = CreateSessionRequest.fromExpress(req);
      const cfg = new SessionConfig({
        interviewType: request.interviewType,
        role: request.role,
        domain: request.domain,
        difficulty: request.difficulty,
        mode: request.mode,
      });

      const session = await this.backendOrchestrator.createSession(cfg, request.offerSdp, request.sessionId);

      if (request.offerSdp) {
        return res.type("application/sdp").send(SessionCreatedResponse.toSdp(session));
      }

      return res.json(SessionCreatedResponse.toView(session));
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async updateConsent(req, res) {
    try {
      const consent = UpdateConsentRequest.fromExpress(req);
      const session = await this.backendOrchestrator.updateConsent(req.params.sessionId, consent);
      return res.json(SessionCreatedResponse.toView(session));
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async startSession(req, res) {
    try {
      const request = StartSessionRequest.fromExpress(req);
      const turn = await this.backendOrchestrator.startSession(request.sessionId);
      return res.json(turn);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async endSession(req, res) {
    try {
      const request = EndSessionRequest.fromExpress(req);
      const report = await this.backendOrchestrator.endSession(
        request.sessionId,
        request.reason,
        request.transcript
      );
      return res.json(report);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async createReport(req, res) {
    return this.endSession(req, res);
  }

  async getReport(req, res) {
    try {
      const report = await this.backendOrchestrator.getReport(req.params.sessionId);
      return res.json(report);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  handleError(error, res) {
    if (error instanceof AppError) {
      this.logger.error(error.message, error.details || error.code);
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }

    this.logger.error("Unexpected session error", error);
    return res.status(500).json({ error: "Failed to process request" });
  }
}
