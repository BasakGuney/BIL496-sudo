import { RealtimeOfferRequest } from "../requests/RealtimeOfferRequest.js";
import { toSdpAnswerView } from "../responses/views.js";

export class RealtimeController {
  constructor(realtime, orchestrator) {
    this.realtime = realtime;
    this.orchestrator = orchestrator;
  }

  async postOffer(sessionId, req) {
    const dto = new RealtimeOfferRequest(req.body || {});
    const session = await this.orchestrator.getSession(sessionId);
    const sdp = await this.realtime.createOfferAnswer(sessionId, dto.offerSdp || req.body || "", session.config);
    return toSdpAnswerView(sdp);
  }
}
