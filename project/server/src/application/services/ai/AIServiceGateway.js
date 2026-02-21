export class AIServiceGateway {
  constructor(client, prompts) {
    this.client = client;
    this.prompts = prompts;
  }

  async generateQuestionPlan(cfg, count = 6) {
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
    if (session.preparedQuestions.length > 0) return session.preparedQuestions[0];
    const questions = await this.generateQuestionPlan(session.config, 1);
    return questions[0];
  }

  async generateNextQuestion(session) {
    const asked = session.questions.map((q) => q.text);
    const memory = session.answerTurns.map((turn) => ({ questionId: turn.questionId, transcript: turn.transcript, durationSec: turn.durationSec }));

    const result = await this.client.callLLM({
      task: "generate_next_question",
      config: this.prompts.buildInterviewerConfig(session.config),
      style: session.config.mode === "Supportive" ? this.prompts.supportiveStyle() : this.prompts.neutralStyle(),
      askedQuestions: asked,
      candidateMemory: memory,
      fallbackText: session.config.mode === "Supportive"
        ? "İsterseniz küçük bir ipucu ile devam edebiliriz; az önce anlattığınız deneyimde attığınız adımları biraz daha detaylandırır mısınız?"
        : "Teşekkürler. Az önce bahsettiğiniz deneyimde karar verme yaklaşımınızı biraz daha açar mısınız?",
    });

    return result.text;
  }

  #fallbackQuestionPlan(cfg) {
    const honorific = cfg.gender === "Female" ? "Hanım" : cfg.gender === "Male" ? "Bey" : "";
    const address = `${cfg.firstName}${honorific ? ` ${honorific}` : ""}`.trim();

    if (cfg.interviewType === "HR") {
      return [
        `${address}, hazırsanız başlayalım. Kısaca kendinizden; eğitim hayatınızdan ve iş tecrübelerinizden bahseder misiniz?`,
        "Ekip içinde yaşadığınız bir çatışmayı nasıl yönettiğinizi anlatır mısınız?",
        "Baskı altında karar verdiğiniz bir örnek paylaşır mısınız?",
        "Geri bildirim alıp yaklaşımınızı değiştirdiğiniz bir örnek verir misiniz?",
        "Bu pozisyon için güçlü yönlerinizi örnekle anlatır mısınız?",
        "İlk 3 ayda nasıl bir gelişim planı izlersiniz?",
      ];
    }

    return [
      `${address}, hazırsanız başlayalım. Kısaca kendinizden; eğitim hayatınızdan ve iş tecrübelerinizden bahseder misiniz?`,
      `${cfg.role} rolünde ${cfg.domainInterest} alanında yaptığınız bir çalışmayı anlatır mısınız?`,
      `${cfg.companyOrIndustry} bağlamında bir teknik problemi nasıl çözersiniz?`,
      `${cfg.domainInterest} tarafında hangi metrikleri takip ederek karar alırsınız?`,
      `${cfg.role} için üretim güvenilirliğini artırmak üzere hangi adımları atarsınız?`,
      "Az önce anlattığınız örneği nasıl iyileştirirdiniz?",
    ];
  }
}
