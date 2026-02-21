export class AnswerTurn {
  constructor({ id, questionId, transcript, durationSec = 0 }) {
    this.id = id;
    this.questionId = questionId;
    this.transcript = String(transcript || "");
    this.durationSec = Number(durationSec || 0);
  }
}
