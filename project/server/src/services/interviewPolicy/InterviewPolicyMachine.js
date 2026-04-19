const STAGES = {
  CONFIGURED: "configured",
  OPENING: "opening",
  FIRST_QUESTION_PENDING: "first_question_pending",
  WAITING_CANDIDATE: "waiting_candidate",
  ANSWER_RECEIVED: "answer_received",
  FOLLOWUP_PENDING: "followup_pending",
  NEW_TOPIC_PENDING: "new_topic_pending",
  SUPPORTIVE_REPAIR_PENDING: "supportive_repair_pending",
  CLOSING_PENDING: "closing_pending",
  CLOSING: "closing",
  FINISHED: "finished",
};

function createHistoryEntry(event, from, to, metadata = {}) {
  return {
    event,
    from,
    to,
    at: new Date().toISOString(),
    metadata,
  };
}

function isMetaQuestion(questionText = "") {
  const normalized = String(questionText || "").trim().toLowerCase();
  if (!normalized) return true;

  const metaPatterns = [
    "merhaba",
    "bugünkü mülakat",
    "bugunku mulakat",
    "başlamadan önce sormak istediğiniz",
    "baslamadan once sormak istediginiz",
    "sormak istediğiniz bir şey var mı",
    "sormak istediginiz bir sey var mi",
    "yaklaşık 10-15 dakika sürecek",
    "yaklasik 10-15 dakika surecek",
  ];

  return metaPatterns.some((pattern) => normalized.includes(pattern));
}

export class InterviewPolicyMachine {
  createInitialState(config = {}) {
    return {
      stage: STAGES.CONFIGURED,
      interviewType: config?.interviewType || "Technical",
      mode: config?.mode || "Neutral",
      questionCount: 0,
      currentQuestionIntent: null,
      currentQuestionText: null,
      askedQuestionIntents: [],
      lastCandidateAnswerMeta: null,
      lastAnswerResolution: null,
      nextAction: null,
      activeRealtimePolicy: null,
      policyEnforcements: [],
      qaPairs: [],
      history: [],
    };
  }

  hydrate(state, config = {}) {
    const base = this.createInitialState(config);
    const current = state && typeof state === "object" ? state : {};
    return {
      ...base,
      ...current,
      policyEnforcements: Array.isArray(current.policyEnforcements) ? current.policyEnforcements : [],
      qaPairs: Array.isArray(current.qaPairs) ? current.qaPairs : [],
      history: Array.isArray(current.history) ? current.history : [],
    };
  }

  startSession(state, config = {}) {
    const current = this.hydrate(state, config);
    if (current.stage !== STAGES.CONFIGURED) {
      return current;
    }

    return {
      ...current,
      stage: STAGES.OPENING,
      history: [
        ...current.history,
        createHistoryEntry("SESSION_STARTED", current.stage, STAGES.OPENING),
      ],
    };
  }

  prepareFirstQuestion(state, config = {}) {
    const current = this.hydrate(state, config);
    if (current.stage !== STAGES.OPENING && current.stage !== STAGES.FIRST_QUESTION_PENDING) {
      return current;
    }

    return {
      ...current,
      stage: STAGES.FIRST_QUESTION_PENDING,
      currentQuestionIntent: current.interviewType === "HR" ? "self_presentation" : "technical_experience",
      history: [
        ...current.history,
        createHistoryEntry("OPENING_COMPLETED", current.stage, STAGES.FIRST_QUESTION_PENDING, {
          intent: current.interviewType === "HR" ? "self_presentation" : "technical_experience",
        }),
      ],
    };
  }

  dispatchQuestion(state, questionText, metadata = {}) {
    const current = this.hydrate(state);
    return {
      ...current,
      stage: STAGES.WAITING_CANDIDATE,
      questionCount: current.questionCount + 1,
      currentQuestionText: questionText || current.currentQuestionText,
      askedQuestionIntents: metadata?.intent
        ? [...current.askedQuestionIntents, metadata.intent]
        : current.askedQuestionIntents,
      history: [
        ...current.history,
        createHistoryEntry("QUESTION_DISPATCHED", current.stage, STAGES.WAITING_CANDIDATE, {
          questionText,
          ...metadata,
        }),
      ],
    };
  }

  syncObservedQuestion(state, questionText, metadata = {}) {
    const current = this.hydrate(state);
    const normalizedQuestion = String(questionText || "").trim();
    if (!normalizedQuestion) {
      return current;
    }

    const incomingIndex = Number(metadata?.questionIndex || 0);
    const shouldAdvance =
      (incomingIndex > 0 && incomingIndex > Number(current.questionCount || 0))
      || !String(current.currentQuestionText || "").trim();

    if (!shouldAdvance) {
      return {
        ...current,
        currentQuestionText: normalizedQuestion,
      };
    }

    return this.dispatchQuestion(current, normalizedQuestion, metadata);
  }

  recordCandidateAnswer(state, answer = {}) {
    const current = this.hydrate(state);
    return {
      ...current,
      stage: STAGES.ANSWER_RECEIVED,
      lastCandidateAnswerMeta: {
        questionIndex: Number(answer?.questionIndex || 0),
        startedAt: Number(answer?.startedAt || 0),
        endedAt: Number(answer?.endedAt || 0),
        answerText: String(answer?.answerText || "").trim(),
        rawAnswerText: String(answer?.rawAnswerText || "").trim(),
        verifiedAnswerText: String(answer?.verifiedAnswerText || "").trim(),
        answerTextSource: String(answer?.answerTextSource || "unknown"),
      },
      history: [
        ...current.history,
        createHistoryEntry("CANDIDATE_ANSWER_RECORDED", current.stage, STAGES.ANSWER_RECEIVED, {
          questionIndex: Number(answer?.questionIndex || 0),
        }),
      ],
    };
  }

  applyAnswerResolution(state, resolution = {}, decision = {}) {
    const current = this.hydrate(state);
    const nextStageByAction = {
      ask_followup: STAGES.FOLLOWUP_PENDING,
      ask_new_topic: STAGES.NEW_TOPIC_PENDING,
      supportive_repair: STAGES.SUPPORTIVE_REPAIR_PENDING,
      closing: STAGES.CLOSING_PENDING,
    };
    const nextAction = decision?.nextAction || "ask_new_topic";
    const nextStage = nextStageByAction[nextAction] || STAGES.NEW_TOPIC_PENDING;

    const normalizedQuestionText = String(current.currentQuestionText || "").trim();
    const normalizedAnswerText = String(current.lastCandidateAnswerMeta?.answerText || "").trim();
    const shouldAppendPair =
      normalizedQuestionText.length > 0
      && normalizedAnswerText.length > 0
      && !isMetaQuestion(normalizedQuestionText);

    return {
      ...current,
      stage: nextStage,
      lastAnswerResolution: resolution && typeof resolution === "object" ? resolution : null,
      nextAction,
      qaPairs: shouldAppendPair
        ? [
            ...current.qaPairs,
            {
              index: current.qaPairs.length + 1,
              questionIndex: Number(current.lastCandidateAnswerMeta?.questionIndex || current.questionCount || 0),
              questionText: normalizedQuestionText,
              answerText: normalizedAnswerText,
              answerTextSource: String(current.lastCandidateAnswerMeta?.answerTextSource || "unknown"),
              rawAnswerText: String(current.lastCandidateAnswerMeta?.rawAnswerText || "").trim(),
              verifiedAnswerText: String(current.lastCandidateAnswerMeta?.verifiedAnswerText || "").trim(),
              answerState: resolution?.answerState || null,
              decision: nextAction,
              resolutionMethod: resolution?.method || null,
              confidence: resolution?.confidence ?? null,
              answeredAt: current.lastCandidateAnswerMeta?.endedAt || null,
            },
          ]
        : current.qaPairs,
      history: [
        ...current.history,
        createHistoryEntry("ANSWER_RESOLVED", current.stage, nextStage, {
          nextAction,
          answerState: resolution?.answerState || null,
          reason: decision?.reason || resolution?.reason || null,
        }),
      ],
    };
  }

  registerRealtimePolicyEnforcement(state, payload = {}) {
    const current = this.hydrate(state);
    const enforcementId = String(payload?.id || `policy-${Date.now()}`).trim();
    const existing = current.policyEnforcements.find((item) => String(item?.id || "") === enforcementId) || null;
    const resolutionMethod = String(
      payload?.resolutionMethod
      || existing?.resolutionMethod
      || current.lastAnswerResolution?.method
      || ""
    ).trim();
    const decisionSourceEngine = (() => {
      if (resolutionMethod === "qdrant") return "qdrant";
      if (resolutionMethod === "gpt_fallback") return "gpt";
      if (["rule", "heuristic", "fallback"].includes(resolutionMethod)) return "local";
      return "unknown";
    })();
    const enforcement = {
      ...(existing || {}),
      id: enforcementId,
      nextAction: String(payload?.nextAction || existing?.nextAction || current.nextAction || "ask_new_topic"),
      enforcementLevel: String(payload?.enforcementLevel || existing?.enforcementLevel || "soft"),
      instructionSummary: String(payload?.instructionSummary || existing?.instructionSummary || "").trim(),
      answerState: payload?.answerState || existing?.answerState || current.lastAnswerResolution?.answerState || null,
      questionText: String(payload?.questionText || existing?.questionText || current.currentQuestionText || "").trim(),
      answerText: String(payload?.answerText || existing?.answerText || current.lastCandidateAnswerMeta?.answerText || "").trim(),
      answerTextSource: String(payload?.answerTextSource || existing?.answerTextSource || current.lastCandidateAnswerMeta?.answerTextSource || "unknown"),
      issuedAt: String(payload?.issuedAt || existing?.issuedAt || new Date().toISOString()),
      deliveredAt: payload?.deliveredAt || existing?.deliveredAt || null,
      deliveryChannel: payload?.deliveryChannel || existing?.deliveryChannel || null,
      observedQuestionText: existing?.observedQuestionText || null,
      observedRelation: existing?.observedRelation || null,
      compliance: existing?.compliance || null,
      observedAt: existing?.observedAt || null,
      resolutionMethod: resolutionMethod || null,
      decisionSourceEngine: payload?.decisionSourceEngine || existing?.decisionSourceEngine || decisionSourceEngine,
      resolutionConfidence: payload?.resolutionConfidence ?? existing?.resolutionConfidence ?? current.lastAnswerResolution?.confidence ?? null,
      resolutionReason: payload?.resolutionReason || existing?.resolutionReason || current.lastAnswerResolution?.reason || null,
    };

    const nextPolicyEnforcements = existing
      ? current.policyEnforcements.map((item) => String(item?.id || "") === enforcementId ? enforcement : item)
      : [...current.policyEnforcements, enforcement];

    return {
      ...current,
      activeRealtimePolicy: enforcement,
      policyEnforcements: nextPolicyEnforcements,
      history: [
        ...current.history,
        createHistoryEntry("REALTIME_POLICY_ENFORCED", current.stage, current.stage, {
          enforcementId: enforcement.id,
          nextAction: enforcement.nextAction,
          enforcementLevel: enforcement.enforcementLevel,
        }),
      ],
    };
  }

  registerRealtimePolicyObservation(state, payload = {}) {
    const current = this.hydrate(state);
    const enforcementId = String(payload?.enforcementId || current.activeRealtimePolicy?.id || "").trim();
    if (!enforcementId) {
      return current;
    }

    const observedQuestionText = String(payload?.observedQuestionText || "").trim();
    const observedRelation = payload?.observedRelation || null;
    const compliance = payload?.compliance || null;
    const observedAt = payload?.observedAt || new Date().toISOString();

    const nextPolicyEnforcements = current.policyEnforcements.map((item) => {
      if (String(item?.id || "") !== enforcementId) return item;
      return {
        ...item,
        deliveredAt: item?.deliveredAt || observedAt,
        observedQuestionText,
        observedRelation,
        compliance,
        observedAt,
      };
    });

    const activeRealtimePolicy = String(current.activeRealtimePolicy?.id || "") === enforcementId
      ? {
          ...current.activeRealtimePolicy,
          deliveredAt: current.activeRealtimePolicy?.deliveredAt || observedAt,
          observedQuestionText,
          observedRelation,
          compliance,
          observedAt,
        }
      : current.activeRealtimePolicy;

    return {
      ...current,
      activeRealtimePolicy,
      policyEnforcements: nextPolicyEnforcements,
      history: [
        ...current.history,
        createHistoryEntry("REALTIME_POLICY_OBSERVED", current.stage, current.stage, {
          enforcementId,
          observedRelation,
          compliance,
        }),
      ],
    };
  }
}

export { STAGES as InterviewPolicyStages };
