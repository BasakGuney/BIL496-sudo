import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeedbackReport, SessionConfig } from "@/lib/types";
import App from "@/app/App";

const config: SessionConfig = {
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "Kadın",
  interviewType: "Technical",
  role: "Frontend Developer",
  companyOrIndustry: "Teknoloji",
  domainInterest: "React",
  difficulty: "Junior",
  mode: "Supportive",
  consent: { mic: true, camera: true },
  cvFile: null,
  candidateBrief: null,
};

const report: FeedbackReport = {
  sessionId: "S-42",
  overallScore: 82,
  recommendations: [],
  content: [],
  communication: [],
  behavioral: [],
  transcript: [],
  transcriptText: "",
  audioAnalysis: { model: null },
  audioLlmReport: null,
  transcriptAnalysis: null,
  visionLlmAnalysis: null,
  analysisStatus: {},
};

vi.mock("@/components/layout/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/layout/Stepper", () => ({
  Stepper: ({ step }: { step: number }) => <div data-testid="stepper">{step}</div>,
}));

vi.mock("@/pages/SetupPage", () => ({
  SetupPage: ({ onPrepared }: { onPrepared: (cfg: SessionConfig, sid: string) => void }) => (
    <button type="button" onClick={() => onPrepared(config, "S-42")}>setup-next</button>
  ),
}));

vi.mock("@/pages/PreviewPage", () => ({
  PreviewPage: ({ onStartInterview }: { onStartInterview: () => void }) => (
    <button type="button" onClick={onStartInterview}>preview-next</button>
  ),
}));

vi.mock("@/pages/InterviewPage", () => ({
  InterviewPage: ({ onFinish }: { onFinish: (value: FeedbackReport) => void }) => (
    <button type="button" onClick={() => onFinish(report)}>finish-interview</button>
  ),
}));

vi.mock("@/pages/FeedbackPage", () => ({
  FeedbackPage: ({ sessionId }: { sessionId: string }) => <div>feedback:{sessionId}</div>,
}));

vi.mock("@/pages/HistoryPage", () => ({
  HistoryPage: () => <div>history-page</div>,
}));

vi.mock("@/lib/api", () => ({
  getReport: vi.fn(),
}));

describe("App smoke", () => {
  it("advances through setup, preview, interview, and feedback states", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "setup-next" }));
    expect(screen.getByRole("button", { name: "preview-next" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "preview-next" }));
    expect(screen.getByRole("button", { name: "finish-interview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "finish-interview" }));
    expect(screen.getByText("feedback:S-42")).toBeInTheDocument();
  });
});
