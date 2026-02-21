export class CreateSessionRequest {
  constructor({
    mode,
    offerSdp,
    sessionId,
    interviewType,
    firstName,
    lastName,
    gender,
    role,
    domain,
    companyOrIndustry,
    difficulty,
  }) {
    this.mode = mode;
    this.offerSdp = offerSdp;
    this.sessionId = sessionId;
    this.interviewType = interviewType;
    this.firstName = firstName;
    this.lastName = lastName;
    this.gender = gender;
    this.role = role;
    this.domain = domain;
    this.companyOrIndustry = companyOrIndustry;
    this.difficulty = difficulty;
  }

  static fromExpress(req) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    return new CreateSessionRequest({
      mode: (req.query.mode || body.mode || "Neutral").toString(),
      offerSdp: typeof req.body === "string" ? req.body : body.offerSdp || "",
      sessionId: req.query.sessionId ? req.query.sessionId.toString() : body.sessionId,
      interviewType: (req.query.interviewType || body.interviewType || "HR").toString(),
      firstName: (req.query.firstName || body.firstName || "").toString(),
      lastName: (req.query.lastName || body.lastName || "").toString(),
      gender: (req.query.gender || body.gender || "Erkek").toString(),
      role: (req.query.role || body.role || "").toString(),
      domain: (req.query.domain || body.domain || body.domainInterest || "").toString(),
      companyOrIndustry: (req.query.companyOrIndustry || body.companyOrIndustry || "").toString(),
      difficulty: (req.query.difficulty || body.difficulty || "Junior").toString(),
    });
  }
}
