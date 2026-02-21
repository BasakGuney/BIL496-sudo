function honorific(gender) {
  if (gender === "Female") return "Hanım";
  if (gender === "Male") return "Bey";
  return "";
}

export class PromptTemplates {
  buildInterviewerConfig(cfg) {
    const fullName = `${cfg.firstName} ${cfg.lastName}`.trim();
    return {
      language: "tr",
      interview: {
        type: cfg.interviewType,
        role: cfg.role,
        companyOrIndustry: cfg.companyOrIndustry,
        domainInterest: cfg.domainInterest,
        difficulty: cfg.difficulty,
        mode: cfg.mode,
        candidate: {
          firstName: cfg.firstName,
          lastName: cfg.lastName,
          honorific: honorific(cfg.gender),
          address: `${fullName}${honorific(cfg.gender) ? ` ${honorific(cfg.gender)}` : ""}`.trim(),
        },
      },
      flowRules: {
        opening: {
          greet: true,
          askHowAreYou: true,
          interviewerReplyIfAsked: "Ben de iyiyim, teşekkür ederim.",
          briefing: "interview_type_duration_mic_camera_check",
        },
        questionLoop: {
          firstQuestion: "kısaca_kendinizi_anlatın",
          countRange: "5-6",
          enforceSTARForHR: true,
          technicalUseSetupContext: true,
          keepMemoryAcrossAllAnswers: true,
          perQuestionTimeLimitSec: cfg.interviewType === "HR" ? 120 : 150,
          overtimeInterruptionText: "Anladım, bu kadarı yeterli. İsterseniz devam edelim.",
        },
        supportive: {
          enabled: cfg.mode === "Supportive",
          cues: ["bilmiyorum", "ııı", "eee", "aaa"],
          actions: ["give_hint", "reframe", "next_question"],
          tone: "positive_relaxing",
        },
        closing: {
          closePolitely: true,
          waitCandidateGoodbye: true,
        },
      },
      scoringRules: {
        answerRelevancyPerQuestion: true,
        spokenFeedbackDisabled: true,
      },
    };
  }

  supportiveStyle() {
    return { tone: "supportive", encouragementLevel: "high", redirection: "gentle", voice: "cheerful" };
  }

  neutralStyle() {
    return { tone: "neutral", encouragementLevel: "low", redirection: "strict", voice: "professional" };
  }
}
