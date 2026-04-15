export class AIServiceGateway {
  constructor({ client, prompts }) {
    this.client = client;
    this.prompts = prompts;
  }

  formatCandidateBrief(cfg = {}) {
    const brief = cfg?.candidateBrief;
    if (!brief || typeof brief !== "object") return "";
    return this.prompts?.formatCandidateBrief ? this.prompts.formatCandidateBrief(brief) : "";
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

  async generatePreviewQuestions(cfg, options = {}) {
    const candidateBriefText = this.formatCandidateBrief(cfg);
    let promptText = "";
    if (cfg.interviewType === "HR") {
      const hrQuestionBank = this.prompts?.hrQuestionBankPromptBlock ? this.prompts.hrQuestionBankPromptBlock() : "";
      promptText = `Sen bir İnsan Kaynakları mülakatçısısın. Adaya sorulabilecek, STAR (Situation, Task, Action, Result) tekniğine uygun, tamamen Türkçe 3 adet İK / davranışsal soru hazırla. Sorular genel karakter, sorumluluk alma, iletişim, takım çalışması, çatışma yönetimi, önceliklendirme ve öz farkındalık odaklı olmalıdır. Teknik detay sorma; kullanılan araçlar, algoritmalar, model isimleri, kütüphaneler veya implementasyon ayrıntılarına girme. ${hrQuestionBank}${candidateBriefText ? ` Adayın CV özeti: ${candidateBriefText}. Soruların en az 2 tanesi bu özette geçen deneyim, proje veya sorumluluklardan türesin; ancak bu sorular da teknik detay değil, adayın bireysel katkısı, davranışı, kararları ve sonuçları üzerine olsun.` : ""} Son 3 soru kendi içinde tema olarak dengeli olsun; aynı temayı tekrar etme. SADECE {"questions": ["Soru 1?", "Soru 2?", "Soru 3?"]} formatında JSON objesi döndür, markdown veya açıklama ekleme.`;
    } else {
      promptText = `Sen uzman bir teknik mülakatçısın. Adayın Rolü: '${cfg.role || "Yazılım Geliştirici"}', Sektörü: '${cfg.companyOrIndustry || "Teknoloji"}', İLGİ ALANI: '${cfg.domain || "Genel"}' ve ZORLUK SEVİYESİ: '${cfg.difficulty || "Junior"}'. 
Lütfen SADECE bu ilgi alanına (örneğin React seçilmişse doğrudan React ile ilgili, veritabanı seçilmişse sadece veritabanı ile ilgili) ve zorluk seviyesine (Junior ise temel/kavramsal, Intermediate ise senaryo optimizasyonu) kesin olarak uygun 3 tane yaratıcı ve teknik soru hazırla.${candidateBriefText ? ` Adayın CV özeti: ${candidateBriefText}. Soruların en az 2 tanesi bu özette geçen proje, staj veya teknik yetkinlik iddialarını doğrulayan şekilde olsun.` : ""} 
SADECE {"questions": ["Soru 1?", "Soru 2?", "Soru 3?"]} formatında geçerli bir JSON objesi döndür, markdown veya başka metin ekleme.`;
    }

    try {
      if (!this.client?.apiKey) {
        throw new Error("OpenAI API key missing in AI gateway client");
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.client.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: promptText }],
          response_format: { type: "json_object" },
          temperature: 0.6
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI error: ${response.status} - ${errText}`);
      }

      const result = await response.json();
      if (result?.usage && typeof options?.onUsage === "function") {
        options.onUsage(result.usage);
      }
      const content = result.choices?.[0]?.message?.content || "{}";
      
      try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
           return parsed.questions.slice(0, 3);
        }
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return parsed.slice(0, 3);
        }
      } catch (parseError) {
         console.warn("Could not parse OpenAI preview questions response", parseError);
      }
    } catch (err) {
      console.error("Failed to generate preview questions with OpenAI", err.message);
    }

    // Fallbacks
    if (cfg.interviewType === "HR") {
      const experienceSeed = cfg?.candidateBrief?.experienceHighlights?.[0] || cfg?.candidateBrief?.projectHighlights?.[0] || "";
      return [
        experienceSeed
          ? `CV'nizde geçen "${experienceSeed}" deneyiminde en zor an neydi ve bu durumda sizin bireysel katkınız ne oldu?`
          : "Bize zorlu bir takım çalışması deneyiminizden ve oradaki rolünüzden bahseder misiniz?",
        "Eski yöneticinizle aynı fikirde olmadığınız bir anı ve bunu nasıl çözdüğünüzü anlatır mısınız?",
        "Zaman baskısı altında çok fazla görevi aynı anda yönetmeniz gereken bir durumu nasıl atlattınız?"
      ];
    }
    const experienceSeed = cfg?.candidateBrief?.experienceHighlights?.[0] || cfg?.candidateBrief?.projectHighlights?.[0] || "";
    const skillSeed = cfg?.candidateBrief?.skillHighlights?.[0] || cfg.domain || "ilgilendiğiniz alan";
    return [
      experienceSeed
        ? `CV'nizde geçen "${experienceSeed}" deneyiminde karşılaştığınız en zor teknik problemi nasıl çözdünüz?`
        : `Geçmiş deneyimlerinizde ${cfg.domain || "ilgilendiğiniz alanda"} karşılaştığınız en zor teknik problemi nasıl çözdünüz?`,
      `${cfg.role || "Bu rol"} için uyguladığınız temel mimari veya yazılım geliştirme prensipleri nelerdir?`,
      `${skillSeed} kullanırken ${cfg.companyOrIndustry || "sektörünüz"} bağlamında performans veya doğruluk iyileştirmek için yaptığınız somut bir çalışmayı anlatın.`
    ];
  }

  isIntroQuestion(question) {
    const q = (question || "").toLowerCase();
    const markers = [
      "hazırsanız başlayalım mı",
      "merhaba",
      "nasılsın"
    ];
    return markers.some((m) => q.includes(m));
  }

  isShortOrSimpleAnswer(answer) {
    const a = (answer || "").trim().toLowerCase();
    if (a.length < 15 || a === "evet" || a === "hayır" || a === "başlayalım") return true; 
    return false;
  }

  async generateLiveHints(question, options = {}) {
    if (this.isIntroQuestion(question)) return [];
    if (!this.client?.apiKey) return [];
    const prompt = `Sen destekleyici bir mülakat koçusun. Soru: "${question}"
Adayın bu soruya vereceği cevabı yapılandırmasına yardımcı olacak en önemli 3 ipucunu kısa cümleler/yönergeler (3-6 kelime) şeklinde üret. (Örnek: "Önce problemi tanımla", "Kullandığın teknolojileri detaylandır", "Somut bir sonuçtan bahset").
SADECE JSON FORMATINDA YANIT VER:
{"hints": ["İpucu 1", "İpucu 2", "İpucu 3"]}`;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.client.apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.6
        })
      });
      if (!response.ok) return [];
      const result = await response.json();
      if (result?.usage && typeof options?.onUsage === "function") {
        options.onUsage(result.usage);
      }
      const content = result.choices?.[0]?.message?.content || "{}";
      return JSON.parse(content).hints || [];
    } catch(e) {
      console.error("Live hints error:", e);
      return [];
    }
  }

  async generateLiveFeedback(question, answer, options = {}) {
    if (this.isIntroQuestion(question) || this.isShortOrSimpleAnswer(answer)) return null;
    if (!this.client?.apiKey) return null;
    const prompt = `Sen destekleyici bir mülakat koçusun.
Soru: "${question}"
Adayın Cevabı: "${answer}"
Adayın cevabını analiz et ve EKRANDA anlık pop-up olarak belirecek 1 adet açıklayıcı bildirim (toast) üret.
Not düşürmek için DEĞİL, desteklemek için yaz. KESİNLİKLE puanlama yapma (+10 puan, not vb. ifadeler KULLANMA).
"title" alanına asla puan ("+10 Puan: İletişim") yazma. Sadece "Harika Cevap!", "Şuna Dikkat Et", "Gelişim Alanı" gibi başlıklar yaz.
İyi veya başarılı bir cevap ise "Kavramı çok güzel açıkladın, örneğin de çok yerindeydi" tarzı motive edici bir açıklama yap.
Eksikse veya teknik kavramları düzgün açıklayamadıysa "Bu kavramla ilgili tam detay vermedin, şunlardan da bahsetmeliydin" gibi yapıcı, yönlendirici ve net bir şekilde neyi eksik bıraktığını söyleyen açıklayıcı bir 1-2 cümle kur. Örnek: "State yönetiminden bahsettin ama Redux veya Context API gibi araçlardan da örnek vermeliydin".

SADECE JSON FORMATINDA YANIT VER:
{
  "type": "info", // "success", "info" veya "warning"
  "title": "Gelişim Alanı",
  "message": "State yönetiminden bahsettin ama Context API gibi araçlardan da örnek vermeliydin."
}`;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.client.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.6
        })
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (result?.usage && typeof options?.onUsage === "function") {
        options.onUsage(result.usage);
      }
      const content = result.choices?.[0]?.message?.content || "{}";
      return JSON.parse(content);
    } catch(e) {
      console.error("Live feedback error:", e);
      return null;
    }
  }
}
