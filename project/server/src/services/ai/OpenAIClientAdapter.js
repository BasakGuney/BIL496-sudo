export class OpenAIClientAdapter {
  constructor({ realtimeGateway, fetchImpl = fetch, apiKey = "" }) {
    this.realtimeGateway = realtimeGateway;
    this.fetchImpl = fetchImpl;
    this.apiKey = apiKey;
  }

  async createRealtimeCall(offerSdp, sessionPayload) {
    return this.realtimeGateway.createCall({
      offerSdp,
      sessionConfig: JSON.stringify(sessionPayload),
    });
  }

  async callLLM(_payload) {
    return null;
  }
}
