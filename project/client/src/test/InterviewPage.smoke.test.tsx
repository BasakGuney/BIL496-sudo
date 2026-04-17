import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewPage } from "@/pages/InterviewPage";
import type { SessionConfig } from "@/lib/types";
import { BACKEND_URL } from "@/lib/config";

vi.mock("@/lib/realtimeClient", () => ({
  connectRealtimeInterview: vi.fn(),
}));

vi.mock("@/lib/visionAnalysis", () => ({
  createVisionAnalyzer: vi.fn(() => ({
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
  })),
}));

vi.mock("@/lib/api", () => ({
  endSession: vi.fn(),
  uploadCandidateAnswerIncremental: vi.fn(),
}));

import { connectRealtimeInterview } from "@/lib/realtimeClient";
import { endSession, uploadCandidateAnswerIncremental } from "@/lib/api";

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

describe("InterviewPage smoke", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
      configurable: true,
    });

    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/supportive/hints")) {
        return new Response(JSON.stringify({ hints: ["Soruyu kısa tanımla", "Bir örnek ver"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/supportive/feedback")) {
        return new Response(JSON.stringify({
          feedback: {
            type: "info",
            title: "Şuna Dikkat Et",
            message: "Cevabı soruya biraz daha doğrudan bağla.",
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("[STC-02] requests supportive hints and feedback and renders the returned guidance", async () => {
    vi.mocked(connectRealtimeInterview).mockImplementation(async (opts) => {
      setTimeout(() => {
        opts.onInterviewerFinished?.("React'te state nedir?");
        opts.onTranscriptUpdate?.([
          { role: "interviewer", text: "React'te state nedir?", ts: 1000 },
          { role: "candidate", text: "Biraz karıştırdım sanırım.", ts: 2000 },
          { role: "interviewer", text: "Peki devam edelim.", ts: 3000 },
        ]);
      }, 0);

      return {
        analyser: {
          fftSize: 32,
          getByteTimeDomainData: vi.fn(),
        },
        audioCtx: { state: "running", resume: vi.fn() },
        audioEl: { play: vi.fn() },
        getTranscript: () => [],
        getCandidateAnswerAudios: vi.fn(async () => []),
        close: vi.fn(),
      } as never;
    });

    render(
      <InterviewPage
        config={config}
        sessionId="S-300"
        onFinish={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Soruyu kısa tanımla")).toBeInTheDocument();
      expect(screen.getByText("Bir örnek ver")).toBeInTheDocument();
      expect(screen.getByText("Şuna Dikkat Et")).toBeInTheDocument();
      expect(screen.getByText("Cevabı soruya biraz daha doğrudan bağla.")).toBeInTheDocument();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BACKEND_URL}/session/S-300/supportive/hints`,
      expect.objectContaining({ method: "POST" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BACKEND_URL}/session/S-300/supportive/feedback`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("[PTC-02] starts report generation immediately after the interview is finished", async () => {
    vi.mocked(connectRealtimeInterview).mockResolvedValue({
      analyser: {
        fftSize: 32,
        getByteTimeDomainData: vi.fn(),
      },
      audioCtx: { state: "running", resume: vi.fn() },
      audioEl: { play: vi.fn() },
      getTranscript: () => [{ role: "candidate", text: "Son cevabım", ts: 2000 }],
      getCandidateAnswerAudios: vi.fn(async () => []),
      close: vi.fn(),
    } as never);

    vi.mocked(endSession).mockResolvedValue({
      sessionId: "S-300",
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
    });

    const onFinish = vi.fn();
    const onReportUpdate = vi.fn();

    render(
      <InterviewPage
        config={config}
        sessionId="S-300"
        onFinish={onFinish}
        onReportUpdate={onReportUpdate}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /mülakatı bitir/i })).toBeInTheDocument();
    });

    screen.getByRole("button", { name: /mülakatı bitir/i }).click();

    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "S-300",
          notes: ["Analiz devam ediyor..."],
        })
      );
    });

    await waitFor(() => {
      expect(endSession).toHaveBeenCalledWith(
        "S-300",
        [{ role: "candidate", text: "Son cevabım", ts: 2000 }],
        []
      );
      expect(onReportUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "S-300", overallScore: 82 })
      );
    });
  });

  it("[ITC-03] uploads incremental candidate audio on the polling interval and skips duplicates", async () => {
    const audioChunk = {
      questionIndex: 1,
      mimeType: "audio/webm",
      startedAt: 1000,
      endedAt: 2200,
      audioBase64: "Zm9v",
    };

    const getCandidateAnswerAudios = vi
      .fn()
      .mockResolvedValue([audioChunk]);

    vi.mocked(connectRealtimeInterview).mockResolvedValue({
      analyser: {
        fftSize: 32,
        getByteTimeDomainData: vi.fn(),
      },
      audioCtx: { state: "running", resume: vi.fn() },
      audioEl: { play: vi.fn() },
      getTranscript: () => [],
      getCandidateAnswerAudios,
      close: vi.fn(),
    } as never);

    render(
      <InterviewPage
        config={config}
        sessionId="S-300"
        onFinish={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(connectRealtimeInterview).toHaveBeenCalled();
    });

    await new Promise((resolve) => setTimeout(resolve, 2700));

    await waitFor(() => {
      expect(uploadCandidateAnswerIncremental).toHaveBeenCalledWith("S-300", audioChunk);
    });

    expect(uploadCandidateAnswerIncremental).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 2700));

    expect(getCandidateAnswerAudios).toHaveBeenCalledTimes(2);
    expect(uploadCandidateAnswerIncremental).toHaveBeenCalledTimes(1);
  }, 10000);
});
