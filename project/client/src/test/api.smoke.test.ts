import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND_URL } from "@/lib/config";
import { startSession, waitForReadyReport } from "@/lib/api";
import type { FeedbackReport, SessionConfig } from "@/lib/types";

const config: SessionConfig = {
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "Kadın",
  interviewType: "Technical",
  role: "Frontend Developer",
  companyOrIndustry: "Teknoloji",
  domainInterest: "React",
  difficulty: "Junior",
  mode: "Neutral",
  consent: { mic: true, camera: true },
  cvFile: null,
  candidateBrief: null,
};

describe("client api smoke", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes session creation through the backend API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "S-77", previewQuestions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await startSession(config);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/session`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("polls report status until the backend marks every required analysis as ready", async () => {
    vi.useFakeTimers();

    const pendingReport: FeedbackReport = {
      sessionId: "S-77",
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
        audio: true,
        audioLlm: false,
        transcript: false,
        vision: false,
        visionLlm: false,
      },
    };

    const readyReport: FeedbackReport = {
      ...pendingReport,
      overallScore: 84,
      analysisStatus: {
        audio: true,
        audioLlm: true,
        transcript: true,
        vision: false,
        visionLlm: false,
      },
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pendingReport), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(readyReport), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const reportPromise = waitForReadyReport("S-77", { maxAttempts: 2, delayMs: 25 });

    await vi.runAllTimersAsync();
    const report = await reportPromise;

    expect(report).toEqual(readyReport);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BACKEND_URL}/session/S-77/report`,
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BACKEND_URL}/session/S-77/report`,
      expect.objectContaining({ method: "GET" })
    );
  });
});
