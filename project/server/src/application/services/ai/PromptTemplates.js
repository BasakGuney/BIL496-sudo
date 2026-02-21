export class PromptTemplates {
  turkishInterviewerOpening(cfg) {
    const interviewLabel = cfg.interviewType === "HR" ? "insan kaynakları" : "teknik";
    return `Bugünkü mülakat ${interviewLabel} odaklı olacaktır.`;
  }

  supportiveStyle() {
    return "Supportive mod: aday takıldığında kısa ipucu ver ve motive et.";
  }

  neutralStyle() {
    return "Neutral mod: resmi, dengeli, kısa ve tarafsız ilerle.";
  }
}
