export type RouteKey = "setup" | "preview" | "interview" | "feedback";

export const ROUTES: Record<RouteKey, { label: string }> = {
  setup: { label: "Kurulum" },
  preview: { label: "Örnek Sorular" },
  interview: { label: "Mülakat" },
  feedback: { label: "Geri Bildirim" },
};
