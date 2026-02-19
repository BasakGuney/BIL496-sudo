export const InterviewType = Object.freeze({
  HR: "HR",
  Technical: "Technical",
});

export function normalizeInterviewType(value) {
  const normalized = String(value || "HR").trim().toLowerCase();
  return normalized === "technical" ? InterviewType.Technical : InterviewType.HR;
}
