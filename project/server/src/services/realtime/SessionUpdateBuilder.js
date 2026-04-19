export class SessionUpdateBuilder {
  constructor({ turnPolicy, promptTemplates }) {
    this.turnPolicy = turnPolicy;
    this.promptTemplates = promptTemplates;
  }

  buildFixedOpening(cfg = {}) {
    const firstName = String(cfg.firstName || "Aday").trim();
    const genderText = String(cfg.gender || "").trim().toLowerCase();
    const honorific = genderText.includes("kad") ? "Hanım" : "Bey";
    const interviewText = String(cfg.interviewType || "").trim().toLowerCase();
    const interviewLabel = interviewText.includes("tech") ? "teknik mülakat" : "insan kaynakları mülakatı";

    return `Merhaba ${firstName} ${honorific}. Bugünkü mülakatınızı ben gerçekleştireceğim. Bu mülakat ${interviewLabel} olarak ilerleyecek ve yaklaşık 10-15 dakika sürecek. Başlamadan önce sormak istediğiniz bir şey var mı?`;
  }

  buildInstructionText(cfg, { includeOpeningRule = true, policyDirective = null } = {}) {
    const fixedOpening = this.buildFixedOpening(cfg);
    const openingRule = ` ILK ASISTAN MESAJI KURALI: Mulakati su sabit acilis paragrafiyla baslat ve bu paragrafi kelimesi kelimesine kullan: "${fixedOpening}" Bu sabit acilis paragrafini yalnizca bir kez soyle. Aday yanit verdikten sonra yeniden selamlama, yeniden tanitma veya ikinci bir baslangic cumlesi kurma; dogrudan ilk gercek soruya gec.`;
    const policyRule = policyDirective
      ? ` ${this.promptTemplates.policyConstraintInstructions(policyDirective)}`
      : "";

    return `${this.promptTemplates.sessionInstructions(cfg)}${includeOpeningRule ? openingRule : ""}${policyRule}`;
  }

  buildSessionCreate(cfg) {
    return {
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions: this.buildInstructionText(cfg, { includeOpeningRule: true }),
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: this.turnPolicy.serverVad(),
        },
        output: { voice: "marin" },
      },
    };
  }

  buildSessionUpdate(cfg, { policyDirective = null } = {}) {
    return {
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions: this.buildInstructionText(cfg, {
        includeOpeningRule: false,
        policyDirective,
      }),
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: this.turnPolicy.serverVad(),
        },
        output: { voice: "marin" },
      },
    };
  }
}
