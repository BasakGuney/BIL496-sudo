export class PromptTemplates {
  turkishInterviewerOpening(cfg) {
    const firstName = cfg.firstName || "Aday";
    const honorific = cfg.gender === "Kadın" ? "Hanım" : "Bey";
    const interviewLabel = cfg.interviewType === "Technical" ? "teknik" : "insan kaynakları";

    return [
      `Merhaba ${firstName} ${honorific}, bugünkü mülakatınızı ben gerçekleştireceğim.`,
      `Bu mülakat ${interviewLabel} mülakatı olarak gerçekleşecek, yaklaşık 10-15 dakika sürecek ve soru-cevap şeklinde ilerleyeceğiz.`,
      "Hazırsanız başlayalım mı?",
      "Aday evet dedikten sonra ilk soru: 'İlk soru olarak kısaca kendinizden bahsedebilir misiniz?'",
      "Mülakat boyunca Türkçen iyi, net ve doğal olmalı; hızlı konuşma.",
      "Kapanışta tanışma memnuniyetini belirt, değerlendirme ve geri dönüş süresi paylaş, adayın 'iyi günler/görüşmek üzere' vedasını bekleyip bitir.",
    ].join(" ");
  }

  supportiveStyle() {
    return "Supportive mod: aday takıldığında (ııı, bilmiyorum) kısa ipucu ver ya da başka soruya nazikçe geç; motive edici ol.";
  }

  neutralStyle() {
    return "Neutral mod: resmi, dengeli ve tarafsız ilerle; gereksiz ipucu verme.";
  }

  hrQuestionRules() {
    return "HR modunda STAR yaklaşımına uygun, teknik derinlik içermeyen 5-6 davranışsal soru sor. Her soru için süre limiti belirt; aşılırsa 'Bu kadar yeterli, teşekkürler' diyerek sonraki soruya geç.";
  }

  technicalQuestionRules(cfg) {
    return `Technical modda ${cfg.role || "hedef rol"}, ${cfg.domain || "ilgi alanı"} ve şirket/sektör bağlamına uygun 5-6 teknik soru sor. Her soru için süre limiti belirt; aşılırsa nazikçe sonraki soruya geç.`;
  }
}
