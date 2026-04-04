const DEFAULT_PRICING = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o-realtime": { input: 5.0, output: 20.0, audioInput: 40.0, audioOutput: 80.0 },
  "gpt-4o-mini-transcribe": { perMinute: 0.3 },
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value) => Math.round(value * 10000) / 10000;

export class CostEstimator {
  constructor({ pricing = DEFAULT_PRICING } = {}) {
    this.pricing = pricing;
  }

  estimate(tokenUsage = null) {
    if (!tokenUsage || typeof tokenUsage !== "object") {
      return { currency: "USD", total: 0, breakdown: {} };
    }

    const pricingMini = this.pricing["gpt-4o-mini"];
    const pricingRealtime = this.pricing["gpt-4o-realtime"];

    const costFromTokens = (usage, pricing) => {
      if (!usage || !pricing) return 0;
      const prompt = toNumber(usage.prompt);
      const completion = toNumber(usage.completion);
      const inputCost = (prompt / 1_000_000) * toNumber(pricing.input);
      const outputCost = (completion / 1_000_000) * toNumber(pricing.output);
      return inputCost + outputCost;
    };

    const breakdown = {
      previewQuestions: costFromTokens(tokenUsage.previewQuestions, pricingMini),
      liveHints: costFromTokens(tokenUsage.liveHints, pricingMini),
      liveFeedback: costFromTokens(tokenUsage.liveFeedback, pricingMini),
      transcriptEvaluation: costFromTokens(tokenUsage.transcriptEvaluation, pricingMini),
      audioLlmInterpretation: costFromTokens(tokenUsage.audioLlmInterpretation, pricingMini),
      visionLlmReport: costFromTokens(tokenUsage.visionLlmReport, pricingMini),
    };

    const realtimeUsage = tokenUsage.realtimeApi || {};
    const realtimeTokenCost = costFromTokens(
      { prompt: toNumber(realtimeUsage.inputTokens), completion: toNumber(realtimeUsage.outputTokens) },
      pricingRealtime
    );

    const audioInputSeconds = toNumber(realtimeUsage.audioInputSeconds);
    const audioOutputSeconds = toNumber(realtimeUsage.audioOutputSeconds);
    const audioInputPerMinute = toNumber(pricingRealtime?.audioInput) / 60;
    const audioOutputPerMinute = toNumber(pricingRealtime?.audioOutput) / 60;
    const realtimeAudioInputCost = (audioInputSeconds / 60) * audioInputPerMinute;
    const realtimeAudioOutputCost = (audioOutputSeconds / 60) * audioOutputPerMinute;

    breakdown.realtimeTokens = realtimeTokenCost;
    breakdown.realtimeAudioInput = realtimeAudioInputCost;
    breakdown.realtimeAudioOutput = realtimeAudioOutputCost;
    breakdown.realtimeApi = realtimeTokenCost + realtimeAudioInputCost + realtimeAudioOutputCost;

    const total = Object.values(breakdown).reduce((sum, value) => sum + toNumber(value), 0);

    return {
      currency: "USD",
      total: roundMoney(total),
      breakdown: Object.fromEntries(
        Object.entries(breakdown).map(([key, value]) => [key, roundMoney(toNumber(value))])
      ),
    };
  }
}
