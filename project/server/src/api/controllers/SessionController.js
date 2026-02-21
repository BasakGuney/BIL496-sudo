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
}
