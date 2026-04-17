import { InterviewType } from "../enums/InterviewType.js";
import { SessionMode, normalizeSessionMode } from "../enums/SessionMode.js";

const normalizeStringArray = (items = []) =>
  [...new Set((Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))]
    .slice(0, 8);

const normalizeCandidateBrief = (candidateBrief = null) => {
  if (!candidateBrief || typeof candidateBrief !== "object") return null;

  const normalized = {
    headline: String(candidateBrief.headline || "").trim(),
    summary: String(candidateBrief.summary || candidateBrief.technicalSummary || "").trim(),
    technicalSummary: String(candidateBrief.technicalSummary || candidateBrief.summary || "").trim(),
    hrSummary: String(candidateBrief.hrSummary || "").trim(),
    educationHighlights: normalizeStringArray(candidateBrief.educationHighlights),
    experienceHighlights: normalizeStringArray(candidateBrief.experienceHighlights),
    projectHighlights: normalizeStringArray(candidateBrief.projectHighlights),
    skillHighlights: normalizeStringArray(candidateBrief.skillHighlights),
    hrExperienceHighlights: normalizeStringArray(candidateBrief.hrExperienceHighlights),
    hrFocusHighlights: normalizeStringArray(candidateBrief.hrFocusHighlights),
  };

  const hasContent =
    normalized.headline
    || normalized.summary
    || normalized.technicalSummary
    || normalized.hrSummary
    || normalized.educationHighlights.length > 0
    || normalized.experienceHighlights.length > 0
    || normalized.projectHighlights.length > 0
    || normalized.skillHighlights.length > 0
    || normalized.hrExperienceHighlights.length > 0
    || normalized.hrFocusHighlights.length > 0;

  return hasContent ? normalized : null;
};

const ALLOWED_DIFFICULTIES = new Set(["Junior", "Intermediate", "Senior"]);

const pushValidationError = (errors, field, message) => {
  errors.push({ field, message });
};

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
    candidateBrief = null,
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
    this.candidateBrief = normalizeCandidateBrief(candidateBrief);
  }

  getValidationErrors() {
    const errors = [];

    if (!this.firstName.trim()) pushValidationError(errors, "firstName", "First name is required.");
    if (!this.lastName.trim()) pushValidationError(errors, "lastName", "Last name is required.");
    if (!this.role.trim()) pushValidationError(errors, "role", "Role is required.");
    if (!this.domain.trim()) pushValidationError(errors, "domain", "Domain is required.");
    if (!this.companyOrIndustry.trim()) {
      pushValidationError(errors, "companyOrIndustry", "Company or industry is required.");
    }
    if (![InterviewType.HR, InterviewType.TECHNICAL].includes(this.interviewType)) {
      pushValidationError(errors, "interviewType", "Interview type must be HR or Technical.");
    }
    if (![SessionMode.SUPPORTIVE, SessionMode.NEUTRAL].includes(this.mode)) {
      pushValidationError(errors, "mode", "Mode must be Supportive or Neutral.");
    }
    if (!ALLOWED_DIFFICULTIES.has(this.difficulty)) {
      pushValidationError(errors, "difficulty", "Difficulty must be Junior, Intermediate, or Senior.");
    }

    return errors;
  }
}
