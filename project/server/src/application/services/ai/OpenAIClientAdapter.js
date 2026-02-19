import { AppError } from "../../../utils/AppError.js";

export class OpenAIClientAdapter {
  constructor({ apiKey, baseUrl = "https://api.openai.com/v1" } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async createRealtimeCall(offerSdp, sessionPayload) {
    if (!this.apiKey) {
      return `v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=MockAnswer\r\nt=0 0\r\na=x-session:${sessionPayload.mode || "Neutral"}\r\n${offerSdp}`;
    }

    const response = await fetch(`${this.baseUrl}/realtime?model=gpt-4o-realtime-preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/sdp",
      },
      body: offerSdp,
    });

    if (!response.ok) {
      throw new AppError("Realtime provider error", { statusCode: 502, code: "REALTIME_PROVIDER_ERROR" });
    }
    return response.text();
  }

  async callLLM(payload) {
    if (!this.apiKey) {
      return { text: payload.fallbackText || "Kendinizden kısaca bahsedebilir misiniz?" };
    }
    return { text: payload.fallbackText || "Kendinizden kısaca bahsedebilir misiniz?" };
  }
}
