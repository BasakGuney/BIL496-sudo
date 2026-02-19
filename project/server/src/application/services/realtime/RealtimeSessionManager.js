export class RealtimeSessionManager {
  constructor(openai, builder) {
    this.openai = openai;
    this.builder = builder;
  }

  async createOfferAnswer(sessionId, offerSdp, cfg) {
    const sessionPayload = { sessionId, ...this.builder.buildSessionCreate(cfg) };
    return this.openai.createRealtimeCall(offerSdp, sessionPayload);
  }
}
