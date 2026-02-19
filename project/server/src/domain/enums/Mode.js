export const Mode = Object.freeze({
  Supportive: "Supportive",
  Neutral: "Neutral",
});

export function normalizeMode(value) {
  if (!value) {
    return Mode.Neutral;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "supportive" ? Mode.Supportive : Mode.Neutral;
}
