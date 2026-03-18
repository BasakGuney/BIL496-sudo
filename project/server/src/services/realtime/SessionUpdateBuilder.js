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
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: this.turnPolicy.serverVad(),
        },
        output: { voice: "marin" },
      },
    };
  }

  buildSessionUpdate(cfg) {
    return this.buildSessionCreate(cfg);
  }
}
