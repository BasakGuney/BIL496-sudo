import { InterviewType } from "../entities/InterviewType.js";
import { SessionMode, normalizeSessionMode } from "../entities/SessionMode.js";

export class SessionConfig {
  constructor({
    firstName = "",
    lastName = "",
    gender = "Erkek",
    interviewType = InterviewType.HR,
    role = "",
    domain = "",
    companyOrIndustry = "",
    difficulty = "Junior",
    mode,
  } = {}) {
    this.firstName = String(firstName || "");
    this.lastName = String(lastName || "");
    this.gender = gender === "Kadın" ? "Kadın" : "Erkek";
    this.interviewType = interviewType === InterviewType.TECHNICAL ? InterviewType.TECHNICAL : InterviewType.HR;
    this.role = String(role || "");
    this.domain = String(domain || "");
    this.companyOrIndustry = String(companyOrIndustry || "");
    this.difficulty = String(difficulty || "Junior");
    this.mode = normalizeSessionMode(mode || SessionMode.NEUTRAL);
  }
}
