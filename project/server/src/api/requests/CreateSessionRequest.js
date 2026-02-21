export class CreateSessionRequest {
  constructor({ mode, offerSdp, sessionId, interviewType, role, domain, difficulty }) {
    this.mode = mode;
    this.offerSdp = offerSdp;
    this.sessionId = sessionId;
    this.interviewType = interviewType;
    this.role = role;
    this.domain = domain;
    this.difficulty = difficulty;
  }

  static fromExpress(req) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    return new CreateSessionRequest({
      mode: (req.query.mode || body.mode || "Neutral").toString(),
      offerSdp: typeof req.body === "string" ? req.body : body.offerSdp || "",
      sessionId: req.query.sessionId ? req.query.sessionId.toString() : body.sessionId,
      interviewType: (req.query.interviewType || body.interviewType || "HR").toString(),
      role: (req.query.role || body.role || "").toString(),
      domain: (req.query.domain || body.domain || body.domainInterest || "").toString(),
      difficulty: (req.query.difficulty || body.difficulty || "Junior").toString(),
    });
  }
}
