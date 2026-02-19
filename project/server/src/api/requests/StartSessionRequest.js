export class StartSessionRequest {
  constructor(payload = {}) {
    this.clientDevice = payload.clientDevice || null;
  }
}
