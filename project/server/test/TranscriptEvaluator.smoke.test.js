import { describe, expect, it } from "vitest";
import { TranscriptEvaluator } from "../src/services/analysis/TranscriptEvaluator.js";

describe("TranscriptEvaluator smoke", () => {
  it("[UTC-02] marks answers as time-bound overruns when the response exceeds the allocated window", async () => {
    const evaluator = new TranscriptEvaluator({ apiKey: null });

    const report = await evaluator.evaluate({
      sessionId: "S-200",
      transcript: [
        {
          role: "interviewer",
          text: "Bu soruya 30 saniye içinde kısa bir cevap verin: React'te state nedir?",
          ts: 1000,
        },
        {
          role: "candidate",
          text: "State, component içindeki değişken veriyi tutar ve kullanıcı etkileşimine göre güncellenir.",
          ts: 36000,
        },
      ],
      session: {
        config: { interviewType: "Technical" },
      },
    });

    expect(report.qaEvaluations).toHaveLength(1);
    expect(report.qaEvaluations[0]).toEqual(
      expect.objectContaining({
        timeLimitSec: 30,
        durationSec: 35,
        exceededTimeLimit: true,
      })
    );
    expect(report.communication).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pacing",
          detail: expect.stringContaining("süre aşımı"),
        }),
      ])
    );
  });
});
