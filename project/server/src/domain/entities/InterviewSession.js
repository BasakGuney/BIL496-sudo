import { SessionState } from "../enums/SessionState.js";
import { Consent } from "../value-objects/Consent.js";

const createDefaultTokenUsage = () => ({
  previewQuestions: { prompt: 0, completion: 0 },
  liveHints: { prompt: 0, completion: 0 },
  liveFeedback: { prompt: 0, completion: 0 },
  transcriptEvaluation: { prompt: 0, completion: 0 },
  audioLlmInterpretation: { prompt: 0, completion: 0 },
  visionLlmReport: { prompt: 0, completion: 0 },
  realtimeApi: { inputTokens: 0, outputTokens: 0, audioInputSeconds: 0, audioOutputSeconds: 0 },
});

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const pickNumber = (source, keys) => {
  if (!source) return 0;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return toNumber(source[key]);
    }
  }
  return 0;
};

export class InterviewSession {
  constructor({
    id,
    state = SessionState.CONFIGURED,
    config,
    consent = new Consent(),
    offerSdp = "",
    answerSdp = "",
    createdAt = new Date(),
    report = null,
    tokenUsage = null,
  }) {
    this.id = id;
    this.state = state;
    this.config = config;
    this.consent = consent;
    this.offerSdp = offerSdp;
    this.answerSdp = answerSdp;
    this.createdAt = createdAt;
    this.report = report;
    this.tokenUsage = tokenUsage && typeof tokenUsage === "object" ? tokenUsage : createDefaultTokenUsage();
  }

  start() {
    this.state = SessionState.IN_PROGRESS;
  }

  end() {
    this.state = SessionState.ENDING;
  }

  addTokenUsage(kind, usage = {}) {
    if (!this.tokenUsage) {
      this.tokenUsage = createDefaultTokenUsage();
    }

    if (kind === "realtimeApi") {
      const inputTokens = pickNumber(usage, ["input_tokens", "prompt_tokens", "inputTokens"]);
      const outputTokens = pickNumber(usage, ["output_tokens", "completion_tokens", "outputTokens"]);
      const audioInputSeconds = pickNumber(usage, ["input_audio_seconds", "audio_input_seconds", "audioInputSeconds"]);
      const audioOutputSeconds = pickNumber(usage, ["output_audio_seconds", "audio_output_seconds", "audioOutputSeconds"]);
      const audioInputMs = pickNumber(usage, ["input_audio_duration_ms", "audio_input_duration_ms"]);
      const audioOutputMs = pickNumber(usage, ["output_audio_duration_ms", "audio_output_duration_ms"]);

      this.tokenUsage.realtimeApi.inputTokens += inputTokens;
      this.tokenUsage.realtimeApi.outputTokens += outputTokens;
      this.tokenUsage.realtimeApi.audioInputSeconds += audioInputSeconds || (audioInputMs > 0 ? audioInputMs / 1000 : 0);
      this.tokenUsage.realtimeApi.audioOutputSeconds += audioOutputSeconds || (audioOutputMs > 0 ? audioOutputMs / 1000 : 0);
      return;
    }

    const target = this.tokenUsage?.[kind];
    if (!target) return;

    const promptTokens = pickNumber(usage, ["prompt_tokens", "input_tokens", "promptTokens", "inputTokens"]);
    const completionTokens = pickNumber(usage, ["completion_tokens", "output_tokens", "completionTokens", "outputTokens"]);
    target.prompt += promptTokens;
    target.completion += completionTokens;
  }
}
