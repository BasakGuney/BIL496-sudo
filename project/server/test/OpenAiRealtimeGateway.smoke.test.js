import { describe, expect, it, vi } from "vitest";
import { OpenAiRealtimeGateway } from "../src/services/ai/OpenAiRealtimeGateway.js";

describe("OpenAiRealtimeGateway smoke", () => {
  it("[UTC-08] sends the SDP offer to the realtime endpoint and returns the answer SDP", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "v=0\r\no=- realtime-answer",
    }));

    const gateway = new OpenAiRealtimeGateway({
      apiKey: "test-key",
      fetchImpl,
    });

    const answer = await gateway.createCall({
      offerSdp: "v=0\r\no=- realtime-offer",
      sessionConfig: "{\"mode\":\"Supportive\"}",
    });

    expect(answer).toContain("realtime-answer");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer test-key" },
        body: expect.any(FormData),
      })
    );
  });

  it("[UTC-08] surfaces an explicit error when the realtime endpoint is unreachable", async () => {
    const gateway = new OpenAiRealtimeGateway({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    });

    await expect(
      gateway.createCall({
        offerSdp: "offer-sdp",
        sessionConfig: "{\"mode\":\"Supportive\"}",
      })
    ).rejects.toMatchObject({
      code: "OPENAI_REALTIME_UNREACHABLE",
    });
  });
});
