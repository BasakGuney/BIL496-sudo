export class SessionUpdateBuilder {
  constructor({ turnPolicy, promptTemplates }) {
    this.turnPolicy = turnPolicy;
    this.promptTemplates = promptTemplates;
  }

  buildSessionCreate(cfg) {
    const style = cfg.mode === "Supportive"
      ? this.promptTemplates.supportiveStyle()
      : this.promptTemplates.neutralStyle();

    return {
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions: [
        "Sen gerçek bir mülakatçısın ve sadece Türkçe konuşursun.",
        this.promptTemplates.turkishInterviewerOpening(cfg),
        style,
      ].join(" "),
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
