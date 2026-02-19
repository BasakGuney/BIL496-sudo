export class AIServiceGateway {
  constructor(client, prompts) {
    this.client = client;
    this.prompts = prompts;
  }

  async generateFirstQuestion(cfg) {
    const style = cfg.mode === "Supportive" ? this.prompts.supportiveStyle() : this.prompts.neutralStyle();
    const opening = this.prompts.turkishInterviewerOpening(cfg);
    const result = await this.client.callLLM({ fallbackText: `${opening} ${style} İlk soruyu sor.` });
    return result.text;
  }

  async generateNextQuestion(ctx) {
    const result = await this.client.callLLM({ fallbackText: `Devam sorusu üret. Bağlam: ${ctx?.summary || "genel"}` });
    return result.text;
  }
}
