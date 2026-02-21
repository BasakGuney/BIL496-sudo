export class AnswerTurn {
  constructor({ id, questionId, transcript = "", durationSec = 0, relevanceScore = null, summary = null }) {
    this.id = id;
    this.questionId = questionId;
    this.transcript = transcript;
    this.durationSec = durationSec;
    this.relevanceScore = relevanceScore;
    this.summary = summary;
  }
}
