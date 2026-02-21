export class CreateSessionRequest {
  constructor({ mode, offerSdp, sessionId }) {
    this.mode = mode;
    this.offerSdp = offerSdp;
    this.sessionId = sessionId;
  }

  static fromExpress(req) {
    return new CreateSessionRequest({
      mode: (req.query.mode || "Neutral").toString(),
      offerSdp: req.body,
      sessionId: req.query.sessionId ? req.query.sessionId.toString() : undefined,
    });
  }
}
