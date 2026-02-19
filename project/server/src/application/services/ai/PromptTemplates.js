export class PromptTemplates {
  buildInterviewerConfig(cfg) {
    return {
      language: "tr",
      interview: {
        type: cfg.interviewType,
        role: cfg.role,
        companyOrIndustry: cfg.companyOrIndustry,
        domainInterest: cfg.domainInterest,
        difficulty: cfg.difficulty,
        mode: cfg.mode,
      },
      behaviorRules: {
        askOneQuestionAtATime: true,
        keepQuestionShort: true,
        referenceCandidatePreviousAnswers: true,
        supportiveToneWhenModeSupportive: true,
      },
      memoryRules: {
        keepTurnSummary: true,
        avoidRepeatingAskedQuestion: true,
        personalizeFollowUpsFromCandidateHistory: true,
      },
      outputRules: {
        firstQuestionOnly: true,
        asPlainTextQuestion: true,
      },
    };
  }

  supportiveStyle() {
    return { tone: "supportive", encouragementLevel: "medium", redirection: "gentle" };
  }

  neutralStyle() {
    return { tone: "neutral", encouragementLevel: "low", redirection: "strict" };
  }
}
