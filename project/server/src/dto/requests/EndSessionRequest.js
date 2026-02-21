export class EndSessionRequest {
  constructor({ sessionId, reason, transcript }) {
    this.sessionId = sessionId;
    this.reason = reason || null;
    this.transcript = Array.isArray(transcript) ? transcript : [];
  }

  static fromExpress(req) {
    return new EndSessionRequest({
      sessionId: req.params.sessionId,
      reason: req.body?.reason || null,
      transcript: req.body?.transcript,
    });
  }
}
