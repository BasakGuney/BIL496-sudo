export class RecordAnswerRequest {
  constructor(payload = {}) {
    this.transcript = payload.transcript || "";
    this.durationSec = Number(payload.durationSec || 0);
  }
}
