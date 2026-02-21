import { InterviewType } from "../entities/InterviewType.js";
import { SessionMode, normalizeSessionMode } from "../entities/SessionMode.js";

export class SessionConfig {
  constructor({ interviewType = InterviewType.HR, role = "", domain = "", difficulty = "Junior", mode } = {}) {
    this.interviewType = interviewType === InterviewType.TECHNICAL ? InterviewType.TECHNICAL : InterviewType.HR;
    this.role = String(role || "");
    this.domain = String(domain || "");
    this.difficulty = String(difficulty || "Junior");
    this.mode = normalizeSessionMode(mode || SessionMode.NEUTRAL);
  }
}
