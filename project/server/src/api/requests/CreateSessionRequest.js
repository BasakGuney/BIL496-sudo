export class CreateSessionRequest {
  constructor({ mode, offerSdp }) {
    this.mode = mode;
    this.offerSdp = offerSdp;
  }

  static fromExpress(req) {
    return new CreateSessionRequest({
      mode: (req.query.mode || "Neutral").toString(),
      offerSdp: req.body,
    });
  }
}
