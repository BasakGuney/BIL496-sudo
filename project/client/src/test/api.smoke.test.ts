import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND_URL } from "@/lib/config";
import { generatePreviewQuestions, getHistoryInsights, listReports, startSession, updateSessionConfig, waitForReadyReport } from "@/lib/api";
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

describe("Client API smoke", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("[UTC-06][ITC-01] routes session creation through the backend API", async () => {
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

  it("[FR-11] polls report status until the backend marks every required analysis as ready", async () => {
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

  it("[ITC-02] routes preview-question generation through the backend API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ questions: ["Q1", "Q2"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const questions = await generatePreviewQuestions(config);

    expect(questions).toEqual(["Q1", "Q2"]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/preview-questions`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("[ITC-02] routes session config updates through the backend API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ config: { candidateBrief: { headline: "Ada" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const candidateBrief = await updateSessionConfig("S-77", config);

    expect(candidateBrief).toEqual({ headline: "Ada" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/session/S-77/config`,
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("[UAT-01] routes history list and insight requests through the backend API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ sessionId: "S-1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ recentReports: [], trendMetrics: [], commentary: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const reports = await listReports(10);
    const insights = await getHistoryInsights(3);

    expect(reports).toEqual([{ sessionId: "S-1" }]);
    expect(insights).toEqual({ recentReports: [], trendMetrics: [], commentary: {} });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BACKEND_URL}/reports?limit=10`,
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BACKEND_URL}/reports/history-insights?limit=3`,
      expect.objectContaining({ method: "GET" })
    );
  });
});
