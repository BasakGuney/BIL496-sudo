export class AnswerTurn {
  constructor({ id, questionId, transcript = "", durationSec = 0 }) {
    this.id = id;
    this.questionId = questionId;
    this.transcript = transcript;
    this.durationSec = durationSec;
  }
}
