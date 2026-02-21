import { AppError } from "../../domain/errors/AppError.js";

export class OpenAiRealtimeGateway {
  constructor({ apiKey, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async createCall({ offerSdp, sessionConfig }) {
    if (!this.apiKey) {
      throw new AppError("OPENAI_API_KEY is not configured", {
        code: "MISSING_API_KEY",
        status: 500,
      });
    }

    const formData = new FormData();
    formData.set("sdp", offerSdp);
    formData.set("session", sessionConfig);

    let response;
    try {
      response = await this.fetchImpl("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      });
    } catch (networkError) {
      throw new AppError("OpenAI realtime endpoint is unreachable", {
        code: "OPENAI_REALTIME_UNREACHABLE",
        status: 502,
        cause: networkError,
      });
    }

    const bodyText = await response.text();
    if (!response.ok) {
      throw new AppError("OpenAI realtime call failed", {
        code: "OPENAI_REALTIME_CALL_FAILED",
        status: 502,
        cause: bodyText,
      });
    }

    return bodyText;
  }
}
