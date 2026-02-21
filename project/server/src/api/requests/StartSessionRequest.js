export class StartSessionRequest {
  constructor({ sessionId }) {
    this.sessionId = sessionId;
  }

  static fromExpress(req) {
    return new StartSessionRequest({ sessionId: req.params.sessionId });
  }
}
