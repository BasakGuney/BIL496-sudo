export class SessionUpdateBuilder {
  constructor({ turnPolicy, promptTemplates }) {
    this.turnPolicy = turnPolicy;
    this.promptTemplates = promptTemplates;
  }

  buildSessionCreate(cfg) {
    const style = cfg.mode === "Supportive"
      ? this.promptTemplates.supportiveStyle()
      : this.promptTemplates.neutralStyle();

    const interviewRules = cfg.interviewType === "Technical"
      ? this.promptTemplates.technicalQuestionRules(cfg)
      : this.promptTemplates.hrQuestionRules();

    return {
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions: [
        "Sen gerçek bir mülakatçısın ve sadece TÜRKÇE konuşursun.",
        "Akış zorunlu: OPENING -> QUESTION LOOP -> CLOSING.",
        this.promptTemplates.turkishInterviewerOpening(cfg),
        interviewRules,
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
