import { normalizeInterviewType } from "../enums/InterviewType.js";
import { normalizeMode } from "../enums/Mode.js";

export class SessionConfig {
  constructor({ interviewType, role, domain, difficulty, mode }) {
    this.interviewType = normalizeInterviewType(interviewType);
    this.role = role || "Generalist";
    this.domain = domain || "General";
    this.difficulty = difficulty || "Medium";
    this.mode = normalizeMode(mode);
  }
}
