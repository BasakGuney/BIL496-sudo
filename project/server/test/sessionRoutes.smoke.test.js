import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionController } from "../src/api/controllers/SessionController.js";
import { ReportController } from "../src/api/controllers/ReportController.js";
import { createSessionRouter } from "../src/api/routes/sessionRoutes.js";
import { ErrorHandlerMiddleware } from "../src/api/middleware/ErrorHandlerMiddleware.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    type(contentType) {
      this.headers["content-type"] = contentType;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

const validSessionBody = {
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "Kadın",
  interviewType: "Technical",
  role: "Frontend Developer",
  domain: "React",
  companyOrIndustry: "Teknoloji",
  difficulty: "Junior",
  mode: "Supportive",
};

describe("session route smoke", () => {
  let orchestrator;
  let sessionController;
  let reportController;

  beforeEach(() => {
    orchestrator = {
      createSession: vi.fn().mockResolvedValue({
        id: "S-1",
        state: "Configured",
        config: validSessionBody,
        consent: { microphone: false, camera: false },
        answerSdp: "",
      }),
      startSession: vi.fn().mockResolvedValue({
        turnIndex: 1,
        questionText: "Tell me about yourself.",
        sessionId: "S-1",
      }),
      endSession: vi.fn().mockResolvedValue({
        sessionId: "S-1",
        overallScore: 80,
        content: [],
        communication: [],
        behavioral: [],
        recommendations: [],
        notes: [],
        transcript: [],
        feedbackArtifacts: {},
      }),
      generatePreviewQuestions: vi.fn().mockResolvedValue(["Q1"]),
      generateLiveHints: vi.fn().mockResolvedValue(["Kisa bir ornek ver."]),
      generateLiveFeedback: vi.fn().mockResolvedValue({
        type: "info",
        title: "Odak",
        message: "Cevabi daha somutlastir.",
      }),
      recordUsage: vi.fn().mockResolvedValue({ realtimeApi: { inputTokens: 1, outputTokens: 2 } }),
      updateSessionConfig: vi.fn(),
      updateConsent: vi.fn(),
      listReports: vi.fn(),
      getHistoryInsights: vi.fn(),
      ingestCandidateAnswer: vi.fn(),
      ingestVisionFrame: vi.fn(),
      getReport: vi.fn(),
      mockAudioLlm: vi.fn(),
    };
    sessionController = new SessionController({ backendOrchestrator: orchestrator });
    reportController = new ReportController({ backendOrchestrator: orchestrator });
  });

  it("[ITC-04] declares the expected lifecycle and supportive routes", () => {
    const router = createSessionRouter({
      sessionController: { createSession: () => {}, startSession: () => {}, updateSessionConfig: () => {}, generatePreviewQuestions: () => {}, generateLiveHints: () => {}, generateLiveFeedback: () => {}, recordUsage: () => {} },
      consentController: { updateConsent: () => {} },
      realtimeController: { createOfferAnswer: () => {} },
      reportController: {
        listReports: () => {},
        getHistoryInsights: () => {},
        ingestCandidateAnswer: () => {},
        recordRealtimePolicyEnforcement: () => {},
        observeRealtimePolicyOutcome: () => {},
        ingestVisionFrame: () => {},
        endSessionAndCreateReport: () => {},
        getReport: () => {},
        mockAudioLlm: () => {},
      },
    });
    const routeTable = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).sort(),
      }));

    expect(routeTable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/session", methods: ["post"] }),
        expect.objectContaining({ path: "/session/:sessionId/start", methods: ["post"] }),
        expect.objectContaining({ path: "/session/:sessionId/end", methods: ["post"] }),
        expect.objectContaining({ path: "/session/:sessionId/supportive/feedback", methods: ["post"] }),
      ])
    );
  });

  it("[UTC-01] returns validation details for invalid session configuration", async () => {
    const req = { body: {}, query: {}, params: {} };
    const res = createResponse();
    const next = vi.fn();

    await sessionController.createSession(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.code).toBe("INVALID_SESSION_CONFIG");

    new ErrorHandlerMiddleware({ logger: { error: vi.fn() } }).handle(error, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "firstName" }),
        expect.objectContaining({ field: "role" }),
      ])
    );
    expect(orchestrator.createSession).not.toHaveBeenCalled();
  });

  it("[ITC-01][UTC-04] maps create, start, end, and supportive controller outputs", async () => {
    const createRes = createResponse();
    await sessionController.createSession({ body: validSessionBody, query: {}, params: {} }, createRes, vi.fn());
    expect(createRes.body.sessionId).toBe("S-1");

    const startRes = createResponse();
    await sessionController.startSession({ params: { sessionId: "S-1" } }, startRes, vi.fn());
    expect(startRes.body.questionText).toContain("Tell me");

    const feedbackRes = createResponse();
    await sessionController.generateLiveFeedback(
      { params: { sessionId: "S-1" }, body: { question: "Soru", answer: "Cevap" } },
      feedbackRes,
      vi.fn()
    );
    expect(feedbackRes.body.feedback.message).toContain("somut");

    const endRes = createResponse();
    await reportController.endSessionAndCreateReport(
      { params: { sessionId: "S-1" }, body: { transcript: [] } },
      endRes,
      vi.fn()
    );
    expect(endRes.body.sessionId).toBe("S-1");
  });
});
