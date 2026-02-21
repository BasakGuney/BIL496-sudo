export class AIServiceGateway {
  constructor({ client, prompts }) {
    this.client = client;
    this.prompts = prompts;
  }

  async generateFirstQuestion(cfg) {
    if (cfg.interviewType === "HR") {
      return "Kısaca kendinizden bahsedebilir misiniz?";
    }

    return `${cfg.role || "Pozisyon"} için en önemli teknik yetkinlikleriniz nelerdir?`;
  }

  async generateNextQuestion(ctx) {
    const lastTopic = ctx?.lastTopic || "deneyim";
    return `${lastTopic} konusunda biraz daha somut bir örnek paylaşır mısınız?`;
  }
}
