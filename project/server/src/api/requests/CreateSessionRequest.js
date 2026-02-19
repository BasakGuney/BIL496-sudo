import { SessionConfig } from "../../domain/value-objects/SessionConfig.js";

export class CreateSessionRequest {
  constructor(payload = {}) {
    this.interviewType = payload.interviewType;
    this.role = payload.role;
    this.domain = payload.domain;
    this.difficulty = payload.difficulty;
    this.mode = payload.mode;
  }

  toSessionConfig() {
    return new SessionConfig(this);
  }
}
