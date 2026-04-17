import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendOrchestrator } from "../src/orchestration/BackendOrchestrator.js";
import { InterviewSession } from "../src/domain/entities/InterviewSession.js";
import { SessionConfig } from "../src/domain/value-objects/SessionConfig.js";
import { SessionState } from "../src/domain/enums/SessionState.js";
import { CostEstimator } from "../src/services/CostEstimator.js";

function createSession() {
  return new InterviewSession({
    id: "S-1",
    state: SessionState.IN_PROGRESS,
    config: new SessionConfig({
      firstName: "Ada",
      lastName: "Lovelace",
      gender: "Kadın",
      interviewType: "Technical",
      role: "Frontend Developer",
      domain: "React",
      companyOrIndustry: "Teknoloji",
      difficulty: "Junior",
      mode: "Supportive",
    }),
  });
}

describe("BackendOrchestrator smoke", () => {
  let sessions;
  let reports;
  let analyzer;
  let transcriber;
  let orchestrator;
  let session;

  beforeEach(() => {
    session = createSession();
    sessions = {
      findById: vi.fn(async () => session),
      update: vi.fn(async () => session),
      create: vi.fn(async () => session),
    };
    reports = {
      save: vi.fn(async () => undefined),
      findBySessionId: vi.fn(async () => null),
    };
    analyzer = {
      generateReport: vi.fn(async (_session, transcript) => ({
        sessionId: "S-1",
        overallScore: 72,
        recommendations: [],
        content: [],
        communication: [],
        behavioral: [],
        notes: [],
        transcript,
      })),
    };
    transcriber = {
      transcribeCandidateAnswerAudios: vi.fn(async () => ([
        { role: "candidate", text: "Merhaba, ben adayim.", ts: 1000 },
      ])),
    };
    orchestrator = new BackendOrchestrator({
      sessions,
      reports,
      ai: {
        generateFirstQuestion: vi.fn(async (cfg) => `Ilk soru: ${cfg.role}`),
      },
      analyzer,
      guardrails: {},
      realtimeManager: {},
      idGenerator: { newId: () => "S-1" },
      reportArchive: {
        saveSessionConfig: vi.fn(async () => undefined),
        save: vi.fn(async () => null),
      },
      candidateAudioTranscriber: transcriber,
      pythonAnalysisClient: null,
      visionFrameAnalyzer: null,
      costEstimator: null,
    });
  });

  it("[ITC-02] starts the session with the first question generated from the stored config", async () => {
    session.state = SessionState.CONFIGURED;
    orchestrator.guardrails = {
      enforceStateForStart: vi.fn(),
    };
    orchestrator.reportArchive.saveSessionConfig = vi.fn(async () => undefined);

    const result = await orchestrator.startSession("S-1");

    expect(orchestrator.ai.generateFirstQuestion).toHaveBeenCalledWith(session.config);
    expect(result).toEqual({
      turnIndex: 1,
      questionText: "Ilk soru: Frontend Developer",
      sessionId: "S-1",
    });
    expect(session.state).toBe(SessionState.IN_PROGRESS);
  });

  it("[UTC-07] falls back to candidate audio transcription when candidate transcript is missing", async () => {
    await orchestrator.endSession(
      "S-1",
      null,
      [{ role: "interviewer", text: "Kendini tanit.", ts: 500 }],
      [{ questionIndex: 1, mimeType: "audio/webm", startedAt: 1000, endedAt: 1500, audioBase64: "Zm9v" }],
      null
    );

    expect(transcriber.transcribeCandidateAnswerAudios).toHaveBeenCalledTimes(1);
    expect(analyzer.generateReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ role: "interviewer" }),
        expect.objectContaining({ role: "candidate", text: "Merhaba, ben adayim." }),
      ]),
      expect.anything()
    );
  });

  it("[ITC-03] accepts incremental candidate audio once and marks duplicates", async () => {
    orchestrator.reportArchive.saveIncrementalCandidateAnswerAudio = vi.fn(async () => ({
      relativePath: "candidate/q1.webm",
      fullPath: "/tmp/q1.webm",
    }));
    orchestrator.pythonAnalysisClient = {
      convertToWav: vi.fn(async () => "/tmp/q1.wav"),
      analyzeAudioFiles: vi.fn(async () => true),
    };

    const payload = {
      questionIndex: 1,
      mimeType: "audio/webm",
      startedAt: 1000,
      endedAt: 1200,
      audioBase64: "Zm9v",
    };

    const first = await orchestrator.ingestCandidateAnswer("S-1", payload);
    const second = await orchestrator.ingestCandidateAnswer("S-1", payload);

    expect(first).toEqual({ accepted: true, duplicate: false });
    expect(second).toEqual({ accepted: true, duplicate: true });
  });

  it("[STC-05] hydrates partial legacy runtimeState before ingesting audio and vision frames", async () => {
    session.runtimeState = { vision: { status: "ready" } };
    orchestrator.visionFrameAnalyzer = {
      analyzeFrame: vi.fn(async () => ({
        status: "ready",
        message: "ok",
        faceCount: 1,
        eyeCount: 2,
        bbox: { x: 10, y: 10, width: 40, height: 40 },
        imageWidth: 100,
        imageHeight: 100,
        source: "test",
        detector: null,
        faceCropBase64: "",
      })),
    };

    const answerResult = await orchestrator.ingestCandidateAnswer("S-1", {
      questionIndex: 1,
      mimeType: "audio/webm",
      startedAt: 1000,
      endedAt: 1200,
      audioBase64: "Zm9v",
    });

    const visionResult = await orchestrator.ingestVisionFrame("S-1", {
      imageBase64: "Zm9v",
      frameIndex: 1,
    });

    expect(answerResult).toEqual({ accepted: true, duplicate: false });
    expect(visionResult).toEqual(expect.objectContaining({ hasFace: true, faceCount: 1 }));
    expect(session.runtimeState.incrementalCandidateAnswerAudios).toHaveLength(1);
    expect(session.runtimeState.vision.sampledFrames).toBe(1);
  });

  it("[UTC-05][PTC-03] generates a report even when behavioral signals are partial and vision data is missing", async () => {
    const partialReport = {
      sessionId: "S-1",
      overallScore: 68,
      recommendations: [{ title: "Devam", text: "Yanıtları daha somutlaştır." }],
      content: [{ key: "relevance", label: "Relevance", score: 70 }],
      communication: [{ key: "clarity", label: "Clarity", score: 66 }],
      behavioral: [],
      notes: ["Vision unavailable, audio-only evaluation used."],
      transcript: [],
    };
    analyzer.generateReport = vi.fn(async (_session, transcript, visionAnalysis) => ({
      ...partialReport,
      transcript,
      visionAnalysisSeen: visionAnalysis,
    }));

    const report = await orchestrator.endSession(
      "S-1",
      null,
      [{ role: "candidate", text: "Merhaba, ben Ada.", ts: 1000 }],
      [{ questionIndex: 1, mimeType: "audio/webm", startedAt: 900, endedAt: 1400, audioBase64: "Zm9v" }],
      null
    );

    expect(analyzer.generateReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ role: "candidate", text: "Merhaba, ben Ada." })]),
      expect.anything()
    );
    expect(report.overallScore).toBe(68);
    expect(report.behavioral).toEqual([]);
    expect(report.transcriptText).toContain("[Candidate] Merhaba, ben Ada.");
    expect(report.visionAnalysis).toBeUndefined();
    expect(reports.save).toHaveBeenCalledTimes(1);
  });

  it("[PTC-04] carries token usage and estimated cost into the final report", async () => {
    session.addTokenUsage("liveFeedback", { prompt_tokens: 1200, completion_tokens: 600 });
    session.addTokenUsage("realtimeApi", {
      input_tokens: 2000,
      output_tokens: 900,
      input_audio_seconds: 12,
      output_audio_seconds: 8,
    });
    orchestrator.costEstimator = new CostEstimator();

    const report = await orchestrator.endSession(
      "S-1",
      null,
      [{ role: "candidate", text: "Cevabım hazır.", ts: 1000 }],
      [],
      null
    );

    expect(report.tokenUsage).toEqual(expect.objectContaining({
      liveFeedback: expect.objectContaining({ prompt: 1200, completion: 600 }),
      realtimeApi: expect.objectContaining({
        inputTokens: 2000,
        outputTokens: 900,
        audioInputSeconds: 12,
        audioOutputSeconds: 8,
      }),
    }));
    expect(report.estimatedCost).toEqual(expect.objectContaining({
      currency: "USD",
      total: expect.any(Number),
      breakdown: expect.objectContaining({
        liveFeedback: expect.any(Number),
        realtimeApi: expect.any(Number),
      }),
    }));
  });
});
