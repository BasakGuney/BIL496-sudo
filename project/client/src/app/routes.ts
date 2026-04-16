export type RouteKey = "setup" | "preview" | "interview" | "feedback" | "history";

export const ROUTES: Record<RouteKey, { label: string }> = {
  setup: { label: "Kurulum" },
  preview: { label: "Cihaz Testi" },
  interview: { label: "Mülakat" },
  feedback: { label: "Sonuçlar" },
  history: { label: "Geçmiş" },
};
