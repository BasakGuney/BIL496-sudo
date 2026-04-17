import { describe, expect, it, vi } from "vitest";
import { PythonAnalysisClient } from "../src/services/analysis/PythonAnalysisClient.js";

describe("PythonAnalysisClient smoke", () => {
  it("degrades gracefully when the transcript service is unavailable", async () => {
    const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    const client = new PythonAnalysisClient({
      fetchImpl: vi.fn(async () => {
        const error = new Error("connect failed");
        error.cause = { code: "ECONNREFUSED" };
        throw error;
      }),
      logger,
    });

    const ok = await client.analyzeTranscript({
      sessionId: "S-1",
      transcriptText: "Merhaba",
      qaEvaluations: [],
    });

    expect(ok).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("degrades gracefully when the vision service times out", async () => {
    const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    const client = new PythonAnalysisClient({
      fetchImpl: vi.fn(async () => {
        const error = new Error("timed out");
        error.name = "AbortError";
        throw error;
      }),
      logger,
    });

    const ok = await client.analyzeVision({
      sessionId: "S-1",
      visionAnalysis: { status: "ready" },
    });

    expect(ok).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
