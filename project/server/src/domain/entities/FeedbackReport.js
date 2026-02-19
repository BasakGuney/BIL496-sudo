export class FeedbackReport {
  constructor({ id, sessionId, overallScore, strengths = [], improvements = [], evidence = [] }) {
    this.id = id;
    this.sessionId = sessionId;
    this.overallScore = overallScore;
    this.strengths = strengths;
    this.improvements = improvements;
    this.evidence = evidence;
  }
}
