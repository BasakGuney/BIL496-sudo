export class CreateSessionRequest {
  constructor({ mode, offerSdp, sessionId, interviewContext }) {
    this.mode = mode;
    this.offerSdp = offerSdp;
    this.sessionId = sessionId;
    this.interviewContext = interviewContext;
  }

  static fromExpress(req) {
    return new CreateSessionRequest({
      mode: (req.query.mode || "Neutral").toString(),
      offerSdp: req.body,
      sessionId: req.query.sessionId ? req.query.sessionId.toString() : undefined,
      interviewContext: {
        interviewType: req.query.interviewType ? req.query.interviewType.toString() : "HR",
        firstName: req.query.firstName ? req.query.firstName.toString() : "Aday",
        lastName: req.query.lastName ? req.query.lastName.toString() : "",
        gender: req.query.gender ? req.query.gender.toString() : "Kadın",
        role: req.query.role ? req.query.role.toString() : "Genel Pozisyon",
        companyOrIndustry: req.query.companyOrIndustry ? req.query.companyOrIndustry.toString() : "Genel",
        domainInterest: req.query.domainInterest ? req.query.domainInterest.toString() : "Genel",
      },
    });
  }
}
