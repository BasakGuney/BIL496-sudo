import { AppError } from "../../domain/errors/AppError.js";
import { CreateSessionRequest } from "../requests/CreateSessionRequest.js";
import { SessionCreatedResponse } from "../responses/SessionCreatedResponse.js";

export class SessionController {
  constructor({ interviewSessionOrchestrator, logger }) {
    this.interviewSessionOrchestrator = interviewSessionOrchestrator;
    this.logger = logger;
    this.createSession = this.createSession.bind(this);
    this.createReport = this.createReport.bind(this);
  }

  async createSession(req, res) {
    try {
      const createSessionRequest = CreateSessionRequest.fromExpress(req);
      if (!createSessionRequest.offerSdp || typeof createSessionRequest.offerSdp !== "string") {
        throw new AppError("Request body should include SDP offer as text", {
          code: "INVALID_SDP_OFFER",
          status: 400,
        });
      }

      const session = await this.interviewSessionOrchestrator.createInterviewSession(createSessionRequest);
      res.type("application/sdp").send(SessionCreatedResponse.toSdp(session));
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async createReport(req, res) {
    try {
      const sessionId = req.params.sessionId;
      const transcript = req.body?.transcript;
      const report = await this.interviewSessionOrchestrator.createReport({ sessionId, transcript });
      res.json(report);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  handleError(error, res) {
    if (error instanceof AppError) {
      const detail = typeof error.cause === "string" ? error.cause : error.message;
      this.logger.error(error.message, detail);
      return res.status(error.status).type("text/plain").send(detail);
    }

    this.logger.error("Unexpected session error", error);
    return res.status(500).json({ error: "Failed to process session request" });
  }
}
