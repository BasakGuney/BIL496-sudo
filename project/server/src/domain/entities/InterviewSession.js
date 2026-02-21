import { SessionState } from "../enums/SessionState.js";
import { Consent } from "../value-objects/Consent.js";

export class InterviewSession {
  constructor({
    id,
    state = SessionState.CONFIGURED,
    config,
    consent = new Consent(),
    offerSdp = "",
    answerSdp = "",
    createdAt = new Date(),
    report = null,
  }) {
    this.id = id;
    this.state = state;
    this.config = config;
    this.consent = consent;
    this.offerSdp = offerSdp;
    this.answerSdp = answerSdp;
    this.createdAt = createdAt;
    this.report = report;
  }

  start() {
    this.state = SessionState.IN_PROGRESS;
  }

  end() {
    this.state = SessionState.ENDING;
  }
}
