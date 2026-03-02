export class EndSessionRequest {
  constructor({ sessionId, reason, transcript, candidateAnswerAudios }) {
    this.sessionId = sessionId;
    this.reason = reason || null;
    this.transcript = Array.isArray(transcript) ? transcript : [];
    this.candidateAnswerAudios = Array.isArray(candidateAnswerAudios) ? candidateAnswerAudios : [];
  }

  static fromExpress(req) {
    return new EndSessionRequest({
      sessionId: req.params.sessionId,
      reason: req.body?.reason || null,
      transcript: req.body?.transcript,
      candidateAnswerAudios: req.body?.candidateAnswerAudios,
    });
  }
}
