import { SessionState } from "../enums/SessionState.js";
import { Consent } from "./Consent.js";

export class InterviewSession {
  constructor({ id, config, state = SessionState.Configured, consent = new Consent(), preparedQuestions = [] }) {
    this.id = id;
    this.state = state;
    this.config = config;
    this.consent = consent;
    this.questions = [];
    this.answerTurns = [];
    this.preparedQuestions = preparedQuestions;
  }

  start() {
    this.state = SessionState.InProgress;
  }

  end() {
    this.state = SessionState.Completed;
  }
}
