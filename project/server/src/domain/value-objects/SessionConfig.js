import { normalizeInterviewType } from "../enums/InterviewType.js";
import { normalizeMode } from "../enums/Mode.js";

export class SessionConfig {
  constructor({ interviewType, role, companyOrIndustry, domainInterest, domain, difficulty, mode }) {
    this.interviewType = normalizeInterviewType(interviewType);
    this.role = role || "Generalist";
    this.companyOrIndustry = companyOrIndustry || "General";
    this.domainInterest = domainInterest || domain || "General";
    this.domain = this.domainInterest;
    this.difficulty = difficulty || "Medium";
    this.mode = normalizeMode(mode);
  }
}
