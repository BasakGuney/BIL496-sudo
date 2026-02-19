export class PromptTemplates {
  turkishInterviewerOpening(cfg) {
    return `Türkçe bir ${cfg.interviewType} mülakatı başlat. Rol: ${cfg.role}, alan: ${cfg.domain}, zorluk: ${cfg.difficulty}.`;
  }
  supportiveStyle() { return "Nazik, yönlendirici ve cesaretlendirici ton kullan."; }
  neutralStyle() { return "Nötr, değerlendirme odaklı ve resmi ton kullan."; }
}
