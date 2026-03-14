export class SessionUpdateBuilder {
  constructor({ turnPolicy, promptTemplates }) {
    this.turnPolicy = turnPolicy;
    this.promptTemplates = promptTemplates;
  }

  buildSessionCreate(cfg) {
    return {
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions: this.promptTemplates.sessionInstructions(cfg),
      input_audio_transcription: {
        model: "gpt-4o-mini-transcribe",
      },
      audio: {
        input: { turn_detection: this.turnPolicy.serverVad() },
        output: { voice: "marin" },
      },
    };
  }

  buildSessionUpdate(cfg) {
    return this.buildSessionCreate(cfg);
  }
}
