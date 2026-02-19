export class AIServiceGateway {
  constructor(client, prompts) {
    this.client = client;
    this.prompts = prompts;
  }

  async generateQuestionPlan(cfg, count = 5) {
    const plan = await this.client.callLLM({
      task: "generate_question_plan",
      config: this.prompts.buildInterviewerConfig(cfg),
      count,
      fallbackQuestions: this.#fallbackQuestionPlan(cfg),
    });
    return Array.isArray(plan.questions) && plan.questions.length > 0
      ? plan.questions.slice(0, count)
      : this.#fallbackQuestionPlan(cfg).slice(0, count);
  }

  async generateFirstQuestion(session) {
    if (session.preparedQuestions.length > 0) {
      return session.preparedQuestions[0];
    }
    const questions = await this.generateQuestionPlan(session.config, 1);
    return questions[0];
  }

  async generateNextQuestion(session) {
    const asked = session.questions.map((q) => q.text);
    const memory = session.answerTurns.map((turn) => ({
      questionId: turn.questionId,
      transcript: turn.transcript,
      durationSec: turn.durationSec,
    }));

    const result = await this.client.callLLM({
      task: "generate_next_question",
      config: this.prompts.buildInterviewerConfig(session.config),
      style: session.config.mode === "Supportive" ? this.prompts.supportiveStyle() : this.prompts.neutralStyle(),
      askedQuestions: asked,
      candidateMemory: memory,
      fallbackText: "Son cevabınıza dayanarak bu durumu üretim ortamında nasıl ele alırsınız?",
    });

    return result.text;
  }

  #fallbackQuestionPlan(cfg) {
    const role = cfg.role;
    const domain = cfg.domainInterest;
    return [
      `${role} rolünde en güçlü olduğunuz alan nedir ve neden?`,
      `${domain} konusunda gerçek bir projede karşılaştığınız bir problemi nasıl çözdünüz?`,
      `Bu pozisyonda ilk 90 günde hangi teknik hedefleri önceliklendirirsiniz?`,
      `${cfg.companyOrIndustry} bağlamında operasyonel bir riski nasıl azaltırsınız?`,
      `Son cevabınızdan yola çıkarak performans/ölçeklenebilirlik takibini nasıl yaparsınız?`,
    ];
  }
}
