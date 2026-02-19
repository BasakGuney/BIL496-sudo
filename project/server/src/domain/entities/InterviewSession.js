export class InterviewSession {
  constructor({ id, mode, offerSdp, answerSdp, createdAt = new Date() }) {
    this.id = id;
    this.mode = mode;
    this.offerSdp = offerSdp;
    this.answerSdp = answerSdp;
    this.createdAt = createdAt;
  }
}
