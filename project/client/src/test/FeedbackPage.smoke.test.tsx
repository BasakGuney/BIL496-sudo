import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackPage } from "@/pages/FeedbackPage";
import type { FeedbackReport } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getReport: vi.fn(),
}));

import { getReport } from "@/lib/api";

const pendingReport: FeedbackReport = {
  sessionId: "S-100",
  overallScore: 0,
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
  analysisStatus: {
    audio: false,
    audioLlm: false,
    transcript: false,
    vision: false,
    visionLlm: false,
  },
};

describe("FeedbackPage smoke", () => {
  beforeEach(() => {
    vi.mocked(getReport).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("polls and updates the visible analysis status when artifacts become ready", async () => {
    vi.mocked(getReport).mockResolvedValue({
      ...pendingReport,
      transcriptAnalysis: {
        overallScore: 85,
      },
      audioLlmReport: {
        overallScore: 79,
        recommendations: {},
      },
      analysisStatus: {
        audio: true,
        audioLlm: true,
        transcript: true,
        vision: false,
        visionLlm: false,
      },
    });

    render(
      <FeedbackPage
        initialReport={pendingReport}
        sessionId="S-100"
        expectVision={false}
      />
    );

    await waitFor(() => {
      expect(getReport).toHaveBeenCalledWith("S-100");
      expect(screen.getAllByText("Tamamlandı").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("keeps audio analysis pending until the final completed report arrives", async () => {
    let resolveReport: ((value: FeedbackReport) => void) | null = null;
    vi.mocked(getReport).mockImplementation(
      () =>
        new Promise<FeedbackReport>((resolve) => {
          resolveReport = resolve;
        })
    );

    const finalReport: FeedbackReport = {
      ...pendingReport,
      audioLlmReport: {
        overallScore: 79,
        completed: true,
        overallAnalysis: "Final ses raporu",
        recommendations: {
          nextInterview: "Final öneri",
          performanceDevelopment: "Final gelişim önerisi",
        },
      },
      analysisStatus: {
        audio: true,
        audioLlm: true,
        transcript: false,
        vision: false,
        visionLlm: false,
      },
    };

    render(
      <FeedbackPage
        initialReport={{
          ...pendingReport,
          audioLlmReport: {
            overallScore: 65,
            completed: false,
            overallAnalysis: "Ara ses raporu",
            recommendations: {
              nextInterview: "Ara öneri",
              performanceDevelopment: "Ara gelişim önerisi",
            },
          },
          analysisStatus: {
            audio: true,
            audioLlm: false,
            transcript: false,
            vision: false,
            visionLlm: false,
          },
        }}
        sessionId="S-100"
        expectVision={false}
      />
    );

    const audioStatusLabel = screen
      .getAllByText("Ses Analizi")
      .find((element) => element.tagName === "SPAN");
    const audioStatusRow = audioStatusLabel?.closest("div");
    expect(audioStatusRow).not.toBeNull();
    expect(within(audioStatusRow as HTMLElement).getByText("Ses analizi bekleniyor")).toBeInTheDocument();
    expect(screen.queryByText("Ara öneri")).not.toBeInTheDocument();

    resolveReport?.(finalReport);

    await waitFor(() => {
      expect(within(audioStatusRow as HTMLElement).getByText("Tamamlandı")).toBeInTheDocument();
      expect(screen.queryByText("Ara öneri")).not.toBeInTheDocument();
    });
  });
});
