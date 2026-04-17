import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
