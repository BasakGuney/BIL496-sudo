import { InterviewType } from "../enums/InterviewType.js";
import { SessionMode, normalizeSessionMode } from "../enums/SessionMode.js";

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
    cvFile = null,
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
    this.cvFile = cvFile && typeof cvFile === "object"
      ? {
          name: String(cvFile.name || "cv.pdf"),
          mimeType: String(cvFile.mimeType || "application/pdf"),
          dataBase64: String(cvFile.dataBase64 || ""),
        }
      : null;
  }
}
