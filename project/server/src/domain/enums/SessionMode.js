export const SessionMode = Object.freeze({
  SUPPORTIVE: "Supportive",
  NEUTRAL: "Neutral",
});

export function normalizeSessionMode(mode) {
  if (typeof mode !== "string") return SessionMode.NEUTRAL;
  const normalized = mode.trim().toLowerCase();
  return normalized === "supportive" ? SessionMode.SUPPORTIVE : SessionMode.NEUTRAL;
}
