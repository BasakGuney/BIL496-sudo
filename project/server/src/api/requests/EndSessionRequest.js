export class EndSessionRequest {
  constructor(payload = {}) {
    this.reason = payload.reason || null;
  }
}
