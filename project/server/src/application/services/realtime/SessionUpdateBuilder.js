export class SessionUpdateBuilder {
  constructor(turnPolicy) {
    this.turnPolicy = turnPolicy;
  }

  buildSessionCreate(cfg) {
    const honorific = cfg.gender === "Female" ? "Hanım" : cfg.gender === "Male" ? "Bey" : "";
    return {
      interview: {
        interviewType: cfg.interviewType,
        role: cfg.role,
        companyOrIndustry: cfg.companyOrIndustry,
        domainInterest: cfg.domainInterest,
        difficulty: cfg.difficulty,
        mode: cfg.mode,
        candidate: {
          firstName: cfg.firstName,
          lastName: cfg.lastName,
          honorific,
        },
      },
      ruleBasedFlow: {
        opening: "greeting_and_briefing",
        questionLoop: {
          countRange: "5-6",
          firstQuestion: "kısaca_kendinizden_bahseder_misiniz",
          timeoutByQuestionSec: cfg.interviewType === "HR" ? 120 : 150,
          overtimeText: "Anladım bu kadarı yeterli, isterseniz devam edelim.",
        },
        closing: "polite_closing_and_wait_goodbye",
      },
      behaviorRules: {
        useStructuredPrompting: true,
        keepInterviewContextAcrossTurns: true,
        doNotForgetCandidateAnswers: true,
        supportiveHintingWhenStuck: cfg.mode === "Supportive",
      },
      scoringRules: {
        perAnswerRelevancy: true,
        silentEvaluation: true,
      },
      audio: {
        voice: cfg.mode === "Supportive" ? "verse" : "alloy",
        styleHint: cfg.mode === "Supportive" ? "cheerful_positive_relaxing" : "professional_clear",
      },
      turnDetection: this.turnPolicy.buildServerVad(),
    };
  }

  buildSessionUpdate(cfg, memory = []) {
    return {
      session: this.buildSessionCreate(cfg),
      memory,
    };
  }
}
