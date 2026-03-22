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

  async generatePreviewQuestions(cfg) {
    let promptText = "";
    if (cfg.interviewType === "HR") {
      promptText = `Sen bir İnsan Kaynakları mülakatçısısın. Adaya sorulabilecek, STAR (Situation, Task, Action, Result) tekniğine uygun, tamamen Türkçe 3 adet genel İK / davranışsal soru hazırla. Sorular genel karakter ve tecrübe odaklı olmalıdır. SADECE {"questions": ["Soru 1?", "Soru 2?", "Soru 3?"]} formatında JSON objesi döndür, markdown veya açıklama ekleme.`;
    } else {
      promptText = `Sen uzman bir teknik mülakatçısın. Adayın Rolü: '${cfg.role || "Yazılım Geliştirici"}', Sektörü: '${cfg.companyOrIndustry || "Teknoloji"}', İLGİ ALANI: '${cfg.domain || "Genel"}' ve ZORLUK SEVİYESİ: '${cfg.difficulty || "Junior"}'. 
Lütfen SADECE bu ilgi alanına (örneğin React seçilmişse doğrudan React ile ilgili, veritabanı seçilmişse sadece veritabanı ile ilgili) ve zorluk seviyesine (Junior ise temel/kavramsal, Intermediate ise senaryo optimizasyonu) kesin olarak uygun 3 tane yaratıcı ve teknik soru hazırla. 
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
      return [
        "Bize zorlu bir takım çalışması deneyiminizden ve oradaki rolünüzden bahseder misiniz?",
        "Eski yöneticinizle aynı fikirde olmadığınız bir anı ve bunu nasıl çözdüğünüzü anlatır mısınız?",
        "Zaman baskısı altında çok fazla görevi aynı anda yönetmeniz gereken bir durumu nasıl atlattınız?"
      ];
    }
    return [
      `Geçmiş deneyimlerinizde ${cfg.domain || "ilgilendiğiniz alanda"} karşılaştığınız en zor teknik problemi nasıl çözdünüz?`,
      `${cfg.role || "Bu rol"} için uyguladığınız temel mimari veya yazılım geliştirme prensipleri nelerdir?`,
      `${cfg.companyOrIndustry || "Sektörünüz"} dahilinde sistem performansını iyileştirmek için yaptığınız somut bir çalışmayı anlatın.`
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

  async generateLiveHints(question) {
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
      const content = result.choices?.[0]?.message?.content || "{}";
      return JSON.parse(content).hints || [];
    } catch(e) {
      console.error("Live hints error:", e);
      return [];
    }
  }

  async generateLiveFeedback(question, answer) {
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
      const content = result.choices?.[0]?.message?.content || "{}";
      return JSON.parse(content);
    } catch(e) {
      console.error("Live feedback error:", e);
      return null;
    }
  }
}
