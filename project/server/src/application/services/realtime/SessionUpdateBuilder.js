export class SessionUpdateBuilder {
  constructor(turnPolicy) {
    this.turnPolicy = turnPolicy;
  }

  buildSessionCreate(cfg) {
    return {
      interview: {
        interviewType: cfg.interviewType,
        role: cfg.role,
        companyOrIndustry: cfg.companyOrIndustry,
        domainInterest: cfg.domainInterest,
        difficulty: cfg.difficulty,
        mode: cfg.mode,
      },
      behaviorRules: {
        useStructuredPrompting: true,
        keepInterviewContextAcrossTurns: true,
        doNotForgetCandidateAnswers: true,
      },
      audio: {
        voice: "verse",
        styleHint: "warm_natural",
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
