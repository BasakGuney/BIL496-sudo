import { UpdateConsentRequest } from "../requests/UpdateConsentRequest.js";
import { toSessionView } from "../responses/views.js";

export class ConsentController {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  async updateConsent(sessionId, req) {
    const dto = new UpdateConsentRequest(req.body || {});
    const session = await this.orchestrator.updateConsent(sessionId, dto.toConsent());
    return toSessionView(session);
  }
}
