export class FeedbackReport {
  constructor({ id, sessionId, overallScore = 0, details = {}, evidence = [] }) {
    this.id = id;
    this.sessionId = sessionId;
    this.overallScore = Number(overallScore || 0);
    this.details = details;
    this.evidence = evidence;
  }
}
