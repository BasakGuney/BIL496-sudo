export class InterviewSession {
  constructor({ id, mode, offerSdp, answerSdp, createdAt = new Date(), report = null }) {
    this.id = id;
    this.mode = mode;
    this.offerSdp = offerSdp;
    this.answerSdp = answerSdp;
    this.createdAt = createdAt;
    this.report = report;
  }
}
