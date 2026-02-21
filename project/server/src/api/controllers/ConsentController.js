import { UpdateConsentRequest } from "../requests/UpdateConsentRequest.js";
import { SessionView } from "../responses/views/SessionView.js";

export class ConsentController {
  constructor({ backendOrchestrator }) {
    this.backendOrchestrator = backendOrchestrator;
    this.updateConsent = this.updateConsent.bind(this);
  }

  async updateConsent(req, res, next) {
    try {
      const request = UpdateConsentRequest.fromExpress(req);
      const session = await this.backendOrchestrator.updateConsent(req.params.sessionId, request);
      res.json(SessionView.fromSession(session));
    } catch (error) {
      next(error);
    }
  }
}
