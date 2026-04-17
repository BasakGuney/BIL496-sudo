import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIServiceGateway } from "../src/services/ai/AIServiceGateway.js";

describe("AIServiceGateway smoke", () => {
  let fetchMock;
  let gateway;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        usage: { prompt_tokens: 42, completion_tokens: 24 },
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: "info",
                title: "Soruya Dön",
                message: "Bu örnek ilginç, şimdi soruya daha doğrudan bağlayalım.",
              }),
            },
          },
        ],
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    gateway = new AIServiceGateway({
      client: { apiKey: "test-key" },
      prompts: {},
    });
  });

  it("[UTC-03] returns redirect-style supportive feedback for an off-topic answer", async () => {
    const onUsage = vi.fn();

    const feedback = await gateway.generateLiveFeedback(
      "React'te state nedir?",
      "Aslında geçen hafta farklı bir projede ekipçe çok yorulmuştuk ve şirket kültürü de ilginçti.",
      { onUsage }
    );

    expect(feedback).toEqual({
      type: "info",
      title: "Soruya Dön",
      message: "Bu örnek ilginç, şimdi soruya daha doğrudan bağlayalım.",
    });
    expect(onUsage).toHaveBeenCalledWith({ prompt_tokens: 42, completion_tokens: 24 });

    const [, request] = fetchMock.mock.calls[0];
    expect(request.method).toBe("POST");
    expect(String(request.body)).toContain("React'te state nedir?");
    expect(String(request.body)).toContain("Aslında geçen hafta farklı bir projede ekipçe çok yorulmuştuk");
    expect(String(request.body)).toContain("destekleyici bir mülakat koçusun");
  });
});
