import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PromptTemplates {
  constructor() {
    this.hrQuestionBank = this.loadHrQuestionBank();
  }

  loadHrQuestionBank() {
    try {
      const filePath = path.join(__dirname, "data", "hr_question_bank.json");
      return JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      console.warn("Failed to load HR question bank", error?.message || error);
      return [];
    }
  }

  hrQuestionBankPromptBlock() {
    if (!Array.isArray(this.hrQuestionBank) || this.hrQuestionBank.length === 0) return "";

    const themeMap = new Map();
    for (const item of this.hrQuestionBank) {
      const theme = String(item?.theme || "general");
      const question = String(item?.question || "").trim();
      if (!question) continue;
      if (!themeMap.has(theme)) themeMap.set(theme, []);
      const bucket = themeMap.get(theme);
      if (bucket.length < 3) bucket.push(question);
    }

    const themeSummary = Array.from(themeMap.entries())
      .map(([theme, questions]) => `${theme}: ${questions.join(" | ")}`)
      .join(" || ");

    return [
      `HR SORU BANKASI TEMALARI: ${Array.from(themeMap.keys()).join(", ")}.`,
      "Aşağıdaki soru havuzu sadece ilham ve sınır belirlemek içindir; cümleleri birebir kopyalamak zorunda değilsin ama bu tema dengesini koru.",
      `ÖRNEKLER: ${themeSummary}`,
      "Aynı temadan art arda en fazla 2 soru sor; sonra farklı bir temaya geç.",
      "Özellikle intro, motivation, teamwork, conflict_management, feedback, time_management, stress_pressure, learning ve career_goals temaları arasında denge kur.",
    ].join(" ");
  }

  formatCandidateBrief(candidateBrief, perspective = "technical") {
    if (!candidateBrief || typeof candidateBrief !== "object") return "";

    const lines = [];

    if (perspective === "hr") {
      if (candidateBrief.hrSummary) lines.push(`HR Özeti: ${candidateBrief.hrSummary}`);
      if (Array.isArray(candidateBrief.educationHighlights) && candidateBrief.educationHighlights.length > 0) {
        lines.push(`Eğitim: ${candidateBrief.educationHighlights.join(" | ")}`);
      }
      if (Array.isArray(candidateBrief.hrExperienceHighlights) && candidateBrief.hrExperienceHighlights.length > 0) {
        lines.push(`Deneyim Başlıkları: ${candidateBrief.hrExperienceHighlights.join(" | ")}`);
      }
      if (Array.isArray(candidateBrief.hrFocusHighlights) && candidateBrief.hrFocusHighlights.length > 0) {
        lines.push(`Davranışsal Odaklar: ${candidateBrief.hrFocusHighlights.join(" | ")}`);
      }
      return lines.join(" || ");
    }

    if (candidateBrief.headline) lines.push(`Başlık: ${candidateBrief.headline}`);
    if (candidateBrief.technicalSummary || candidateBrief.summary) {
      lines.push(`Teknik Özet: ${candidateBrief.technicalSummary || candidateBrief.summary}`);
    }
    if (Array.isArray(candidateBrief.educationHighlights) && candidateBrief.educationHighlights.length > 0) {
      lines.push(`Eğitim: ${candidateBrief.educationHighlights.join(" | ")}`);
    }
    if (Array.isArray(candidateBrief.experienceHighlights) && candidateBrief.experienceHighlights.length > 0) {
      lines.push(`Deneyim: ${candidateBrief.experienceHighlights.join(" | ")}`);
    }
    if (Array.isArray(candidateBrief.projectHighlights) && candidateBrief.projectHighlights.length > 0) {
      lines.push(`Projeler: ${candidateBrief.projectHighlights.join(" | ")}`);
    }
    if (Array.isArray(candidateBrief.skillHighlights) && candidateBrief.skillHighlights.length > 0) {
      lines.push(`Yetkinlikler: ${candidateBrief.skillHighlights.join(", ")}`);
    }

    return lines.join(" || ");
  }

  candidateBriefInstructions(cfg) {
    if (cfg?.interviewType === "HR") {
      const formattedBrief = this.formatCandidateBrief(cfg?.candidateBrief, "hr");
      if (!formattedBrief) return "";
      return [
        `CV ÖZETİ: ${formattedBrief}.`,
        "Bu özeti soru üretiminde kullan ama kesin doğru kabul etme; adayın sözlü anlatımıyla doğrulat.",
        "HR özetini teknik veri kaynağı gibi kullanma; bu özet teknik stack, araç, algoritma, kütüphane veya implementasyon detayı içermez.",
        "HR modunda CV'deki proje veya deneyimleri teknik detay sorgulamak için değil, davranışsal içgörü almak için kullan.",
        "Aday bir proje veya stajdan bahsederse kullanılan araçlar, algoritmalar veya teknik implementasyon detaylarına girme.",
        "Bunun yerine adayın bireysel katkısını, ekip içi iletişimini, sorumluluk alma biçimini, karar verme yaklaşımını ve ortaya çıkan sonucu sor.",
        "CV bilgisini madde madde okumadan doğal geçişlerle referans ver.",
      ].join(" ");
    }

    const formattedBrief = this.formatCandidateBrief(cfg?.candidateBrief, "technical");
    if (!formattedBrief) return "";
    return [
      `CV ÖZETİ: ${formattedBrief}.`,
      "Bu özeti soru üretiminde kullan ama kesin doğru kabul etme; adayın sözlü anlatımıyla doğrulat.",
      "Mülakat boyunca en az 2 soruyu CV'de geçen deneyim, proje veya yetkinlik iddialarını derinleştirmeye ayır.",
      "CV'de geçen bir proje veya deneyimden bahsederken adayın bireysel katkısını, karar gerekçesini ve somut sonucunu sor.",
      "CV bilgisini madde madde okumadan doğal geçişlerle referans ver.",
    ].join(" ");
  }

  baseInterviewerInstructions() {
    return [
      "Sen deneyimli ve profesyonel bir mülakatçısın. Doğal, samimi ama profesyonel bir üslupla SADECE TÜRKÇE konuş.",
      "Akış: OPENING -> QUESTION LOOP -> CLOSING.",
      "DOĞALLIK KURALLARI: Her sorudan sonra adayın cevabını kısaca kabul et (\"Anladım\", \"Teşekkürler, güzel bir örnek\", \"İlginç bir deneyim\").",
      "Mekanik geçiş yapma. Cevapla bağlantılı bir geçiş cümlesi kur (\"Az önce bahsettiğiniz X deneyimi çok ilginç. Peki...\").",
      "Gerçek bir mülakatçı gibi kısa tepkiler ver: \"Hmm\", \"Evet\", \"Peki\" gibi onay sesleri kullan.",
      "ÖNEMLİ: Aday öksürürse, boğazını temizlerse veya ufak seslerle araya girerse KESİNLİKLE takılıp aynı soruyu/cümleyi baştan tekrarlama. Bu tarz sesleri cevap zannetme. Kaldığın yerden doğaçlama devam et.",
      "Adayın ismine ara sıra hitap et, ama her cümlede değil.",
      "Soruları şu sırayla ilerlet: tanışma -> geçmiş deneyimler -> teknik/davranışsal derinlik -> kapanış.",
      "AÇILIŞ KURALI: Açılışı yalnızca bir kez yap. Açılışta adayın sorusu olup olmadığını sorduysan ve aday cevap verdiyse yeniden selamlama, yeniden mülakatı tanıtma veya ikinci bir başlangıç paragrafı kurma; doğrudan ilk gerçek soruya geç.",
      "KAPANIŞ KURALLARI: Son sorudan sonra \"Sorularımız bu kadardı. Genel olarak güzel bir mülakat oldu.\" de.",
      "Adaya soru sorma fırsatı ver: \"Sizin bana veya pozisyonla ilgili sormak istediğiniz bir şey var mı?\"",
      "Kısa, pozitif kapanış yap ve adayın ismine hitap et: \"Vakit ayırdığınız için teşekkür ederim. Değerlendirme sonuçlarını kısa süre içinde paylaşacağız. İyi günler dilerim.\" ve adayın vedalaşmasını bekle.",
    ].join(" ");
  }

  turkishInterviewerOpening(cfg) {
    const firstName = cfg.firstName || "Aday";
    const honorific = cfg.gender === "Kadın" ? "Hanım" : "Bey";
    const interviewLabel = cfg.interviewType === "Technical" ? "teknik" : "insan kaynakları";

    return [
      `Hoş geldiniz ${firstName} ${honorific}. Ben bugünkü mülakatınızı gerçekleştireceğim.`,
      "Öncelikle rahat olmanızı isterim, bu bir değerlendirme olduğu kadar karşılıklı tanışma fırsatı da.",
      `${interviewLabel} odaklı ilerleyeceğiz, yaklaşık 10-15 dakika sürecek.`,
      "Başlamadan önce herhangi bir sorunuz var mı?",
      "Adayın sorusu yoksa yeni bir giriş yapmadan tek cümlelik kısa geçişle doğrudan ilk gerçek soruya geç: \"O halde sizi biraz tanımak istiyorum. Kendinizden bahseder misiniz? Eğitiminiz, deneyimleriniz, ilgi alanlarınız...\"",
      "Mülakat boyunca Türkçen iyi, net ve doğal olmalı; hızlı konuşma.",
    ].join(" ");
  }

  supportiveStyle() {
    return "Supportive mod: aday takıldığında (ııı, bilmiyorum) kısa ipucu ver ya da başka soruya nazikçe geç; motive edici ol. Aday sorudan saparsa, nazikçe \"Anlıyorum, peki soruya dönersek...\" diyerek yönlendir.";
  }

  neutralStyle() {
    return "Neutral mod: resmi, dengeli ve tarafsız ilerle; gereksiz ipucu verme.";
  }

  hrQuestionRules() {
    return [
      "HR modunda STAR yaklaşımına uygun, teknik derinlik içermeyen 5-6 davranışsal soru sor.",
      "Eğer aday bir proje veya stajdan bahsederse teknik araçlar, model isimleri, algoritmalar, kütüphaneler veya implementasyon detayları üzerinden soru sorma.",
      "Bunun yerine o deneyimde nasıl davrandığını, nasıl iletişim kurduğunu, nasıl öncelik verdiğini, çatışma veya belirsizliği nasıl yönettiğini ve bireysel katkısının ne olduğunu sor.",
      "DAĞILIM KURALI: En fazla 2 soru proje/staj referanslı olsun; kalan sorular mutlaka farklı davranışsal temalardan gelsin.",
      "Tema çeşitliliği zorunlu olsun: takım çalışması, çatışma yönetimi, geri bildirim alma/verme, baskı altında çalışma, hata yönetimi, motivasyon, öğrenme veya öz farkındalık alanlarından birkaçını gör.",
      "TAKİP KURALLARI: Aday yüzeysel cevap verirse \"Bu durumda siz tam olarak ne yaptınız?\" veya \"Sonuç ne oldu, ölçülebilir bir etki var mıydı?\" diye derinleştir.",
      "Aday \"biz\" derse \"Ekip olarak güzel bir çalışma. Peki sizin bireysel katkınız ne oldu?\" diye sor.",
      "Aday takılırsa (Supportive) \"Bir örnek üzerinden düşünelim...\" diyerek yönlendir.",
      "Aynı örnek üzerinde en fazla 2 takip sorusu sor; sonra mutlaka başka bir davranışsal temaya geç.",
      "Her soruyu doğal bir geçişle bağla, listeden okur gibi sorma.",
      "ZAMAN YÖNETİMİ: Her soru için kendi kendine 1-2 dakika hedefle, süreyi içinden takip et; süre uzarsa nazikçe toparlatıp sonraki soruya geç.",
      "Kuracağın cümlenin içinde 'süre, dakika, saniye' gibi kelimeler KULLANMA, süreyi adaya DİLLENDİRME.",
      this.hrQuestionBankPromptBlock(),
    ].join(" ");
  }

  technicalQuestionRules(cfg) {
    return `Technical modda ${cfg.role || "hedef rol"} pozisyonu için ${cfg.companyOrIndustry || "belirtilen şirket/sektör"} bağlamında ${cfg.domain || "ilgi alanı"} konularına odaklanan, zorluk seviyesi ${cfg.difficulty || "Junior"} olan 5-6 teknik soru sor. Sadece tanım sorma; senaryo bazlı sorular üret (\"Diyelim ki X durumunda Y problemiyle karşılaştınız...\"). Adayın cevabındaki teknik terimleri yakala ve derinleştir (\"Z teknolojisini kullandığınızı söylediniz, neden X yerine Z tercih ettiniz?\"). Trade-off soruları sor (\"Bu yaklaşımın dezavantajları neler olabilir?\"). Junior seviyede temel kavramları, Intermediate seviyede tasarım kararlarını sorgula. TAKİP KURALLARI: Aday yüzeysel cevap verirse somut örnek veya detay iste; aday bir teknoloji/deneyim bahsettiğinde o konuda derinleşen bir takip sorusu sor. Her soruyu doğal bir geçişle bağla. ZAMAN YÖNETİMİ: Her soru için kendi kendine 2-3 dakika hedefle, süreyi içinden takip et; süre uzarsa nazikçe toparlatıp sonraki soruya geç. Kuracağın cümlenin içinde 'süre, dakika, saniye' gibi kelimeler KULLANMA, süreyi adaya DİLLENDİRME.`;
  }

  sessionInstructions(cfg) {
    const style = cfg.mode === "Supportive" ? this.supportiveStyle() : this.neutralStyle();
    const interviewRules = cfg.interviewType === "Technical"
      ? this.technicalQuestionRules(cfg)
      : this.hrQuestionRules();

    return [
      this.baseInterviewerInstructions(),
      this.turkishInterviewerOpening(cfg),
      interviewRules,
      this.candidateBriefInstructions(cfg),
      style,
    ].join(" ");
  }

  transcriptEvaluationSystemPrompt(interviewType = "Technical") {
    const hrMetrics = "Davranışsal ve İK perspektifiyle: İletişim, Empati, Problem Çözme, Özgüven ve Kültürel Uyum metriklerini kullanarak";
    const techMetrics = "Teknik perspektifle: İlgililik, Kapsam ve Derinlik, Teknik Terim Hakimiyeti metriklerini kullanarak";
    const perspective = interviewType === "HR" ? hrMetrics : techMetrics;
    
    return `Türkçe mülakat değerlendirme uzmanısın. ${perspective} sadece geçerli JSON döndür. Şema: {overallScore:number, content:[{key,label,score,detail}], communication:[{key,label,score,detail}], recommendations:[{title,text}], notes:string[], qaEvaluations:[{index:number,question:string,answer:string,relevance:number,clarity:number,durationSec:number,timeLimitSec:number,exceededTimeLimit:boolean,summary:string}] }`;
  }
}
