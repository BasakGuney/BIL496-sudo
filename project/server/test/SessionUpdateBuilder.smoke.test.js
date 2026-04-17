import { describe, expect, it, vi } from "vitest";
import { SessionUpdateBuilder } from "../src/services/realtime/SessionUpdateBuilder.js";

describe("SessionUpdateBuilder smoke", () => {
  it("[ITC-03][FR-12] builds realtime session payload with turn detection and interviewer voice output", () => {
    const builder = new SessionUpdateBuilder({
      turnPolicy: {
        serverVad: vi.fn(() => ({
          type: "server_vad",
          threshold: 0.95,
          create_response: true,
          prefix_padding_ms: 300,
          silence_duration_ms: 1500,
        })),
      },
      promptTemplates: {
        sessionInstructions: vi.fn(() => "Supportive realtime interview instructions."),
      },
    });

    const payload = builder.buildSessionCreate({
      firstName: "Ada",
      gender: "Kadın",
      interviewType: "Technical",
    });

    expect(payload).toEqual(
      expect.objectContaining({
        type: "realtime",
        model: "gpt-realtime-mini",
        instructions: expect.stringContaining("Supportive realtime interview instructions."),
        audio: expect.objectContaining({
          output: { voice: "marin" },
          input: expect.objectContaining({
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: expect.objectContaining({
              type: "server_vad",
              create_response: true,
              silence_duration_ms: 1500,
            }),
          }),
        }),
      })
    );
    expect(payload.instructions).toContain("Merhaba Ada Hanım.");
    expect(payload.instructions).toContain("yaklaşık 10-15 dakika sürecek");
  });

  it("[FR-08] carries time-management instructions into the realtime session payload", () => {
    const builder = new SessionUpdateBuilder({
      turnPolicy: {
        serverVad: vi.fn(() => ({
          type: "server_vad",
          threshold: 0.95,
          create_response: true,
          prefix_padding_ms: 300,
          silence_duration_ms: 1500,
        })),
      },
      promptTemplates: {
        sessionInstructions: vi.fn(() => "ZAMAN YÖNETİMİ: Her soru için kendi kendine 2-3 dakika hedefle, süre uzarsa nazikçe toparlatıp sonraki soruya geç."),
      },
    });

    const payload = builder.buildSessionCreate({
      firstName: "Ada",
      gender: "Kadın",
      interviewType: "Technical",
    });

    expect(payload.instructions).toContain("ZAMAN YÖNETİMİ");
    expect(payload.instructions).toContain("2-3 dakika hedefle");
    expect(payload.instructions).toContain("sonraki soruya geç");
  });
});
