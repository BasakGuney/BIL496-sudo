export class RealtimeSessionManager {
  constructor({ openai, builder }) {
    this.openai = openai;
    this.builder = builder;
  }

  async createOfferAnswer(_sessionId, offerSdp, cfg) {
    const payload = this.builder.buildSessionCreate(cfg);
    return this.openai.createRealtimeCall(offerSdp, payload);
  }

  buildPolicySessionUpdate(cfg, policyDirective = null) {
    return this.builder.buildSessionUpdate(cfg, { policyDirective });
  }
}
