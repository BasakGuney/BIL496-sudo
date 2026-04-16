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
}
