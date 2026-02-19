import { CreateSessionRequest } from "../requests/CreateSessionRequest.js";
import { StartSessionRequest } from "../requests/StartSessionRequest.js";
import { EndSessionRequest } from "../requests/EndSessionRequest.js";
import { toSessionView, toReportView } from "../responses/views.js";

export class SessionController {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  async createSession(req) {
    const dto = new CreateSessionRequest(req.body || {});
    const session = await this.orchestrator.createSession(dto.toSessionConfig());
    return toSessionView(session);
  }

  async startSession(sessionId, req) {
    const _dto = new StartSessionRequest(req.body || {});
    return this.orchestrator.startSession(sessionId);
  }

  async endSession(sessionId, req) {
    const dto = new EndSessionRequest(req.body || {});
    const report = await this.orchestrator.endSession(sessionId, dto.reason);
    return toReportView(report);
  }

  async getSession(sessionId) {
    const session = await this.orchestrator.getSession(sessionId);
    return toSessionView(session);
  }
}
