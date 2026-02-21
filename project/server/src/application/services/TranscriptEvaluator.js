export class TranscriptEvaluator {
  constructor({ apiKey, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async evaluate({ sessionId, transcript }) {
    const safeTranscript = Array.isArray(transcript) ? transcript : [];

    if (safeTranscript.length === 0) {
      return {
        sessionId,
        overallScore: 50,
        content: [
          {
            key: "relevance",
            label: "İlgililik",
            score: 50,
            detail: "Transcript bulunamadığı için detaylı içerik analizi yapılamadı.",
          },
        ],
        communication: [
          {
            key: "pacing",
            label: "Tempo",
            score: 50,
            detail: "Erken sonlandırma nedeniyle iletişim metrikleri sınırlı değerlendirildi.",
          },
        ],
        recommendations: [
          {
            title: "Kısa bir kapanış cevabı verin",
            text: "Bitirmeden önce son soruya 2-3 cümlelik net bir cevap vererek değerlendirmenin daha isabetli olmasını sağlayın.",
          },
        ],
        notes: ["Mülakat erken sonlandırıldığı için transcript boş geldi; rapor minimum veriyle üretildi."],
      };
    }

    const heuristicReport = this.buildHeuristicReport({ sessionId, transcript: safeTranscript });
    if (!this.apiKey) return heuristicReport;

    try {
      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content:
                "Türkçe mülakat değerlendirme uzmanısın. Verilen transcript için sadece geçerli JSON döndür. Şema: {overallScore:number, content:[{key,label,score,detail}], communication:[{key,label,score,detail}], recommendations:[{title,text}], notes:string[] }",
            },
            {
              role: "user",
              content: JSON.stringify({ transcript: safeTranscript }),
            },
          ],
          text: { format: { type: "json_object" } },
        }),
      });

      if (!response.ok) return heuristicReport;

      const body = await response.json();
      const outputText = body?.output_text;
      if (!outputText) return heuristicReport;

      const parsed = JSON.parse(outputText);
      return { sessionId, ...parsed };
    } catch (_error) {
      return heuristicReport;
    }
  }

  buildHeuristicReport({ sessionId, transcript }) {
    const candidateTurns = transcript.filter((t) => t.role === "candidate" && t.text?.trim());
    const candidateTexts = candidateTurns.map((t) => t.text.trim());
    const fullText = candidateTexts.join(" ");
    const words = fullText.split(/\s+/).filter(Boolean);
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    const fillerRegex = /\b(ıı+|eee+|şey|yani|hımm|hmm|bilmiyorum)\b/gi;
    const fillerCount = (fullText.match(fillerRegex) || []).length;

    const avgWordsPerTurn = candidateTurns.length ? words.length / candidateTurns.length : 0;
    const lexicalRichness = words.length ? uniqueWords.size / words.length : 0;
    const fillerRatio = words.length ? fillerCount / words.length : 0;

    const relevanceScore = this.clamp(Math.round(55 + Math.min(30, avgWordsPerTurn * 2.2) + Math.min(8, lexicalRichness * 25)), 45, 95);
    const clarityScore = this.clamp(Math.round(58 + Math.min(20, lexicalRichness * 40) - Math.min(12, fillerRatio * 100)), 40, 92);
    const pacingScore = this.clamp(Math.round(70 - Math.min(22, fillerRatio * 130) + Math.min(8, candidateTurns.length)), 38, 92);
    const overallScore = Math.round((relevanceScore + clarityScore + pacingScore) / 3);

    const recommendations = [];
    if (relevanceScore < 70) {
      recommendations.push({
        title: "Soruda kalma",
        text: "Cevaba başlamadan önce soruyu tek cümleyle yeniden çerçeveleyip ardından örnek verin.",
      });
    }
    if (clarityScore < 70) {
      recommendations.push({
        title: "Net cevap şablonu",
        text: "Cevapları 'özet -> aksiyon -> sonuç' sırasıyla 3 kısa adımda anlatın.",
      });
    }
    if (pacingScore < 70) {
      recommendations.push({
        title: "Akıcılık",
        text: "Dolgu kelimeleri azaltmak için cümle aralarında 1 saniye bilinçli duraklayın.",
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Güçlü ilerleme",
        text: "Aynı netlik seviyesini koruyup kritik deneyimlerde sayısal sonuç eklemeye devam edin.",
      });
    }

    return {
      sessionId,
      overallScore,
      content: [
        {
          key: "relevance",
          label: "İlgililik",
          score: relevanceScore,
          detail: `${candidateTurns.length} aday cevabı üzerinden soru odağına yakınlık ve cevap kapsamı analiz edildi.`,
        },
        {
          key: "clarity",
          label: "Netlik",
          score: clarityScore,
          detail: `Kelime çeşitliliği ve ifade düzeni değerlendirildi (benzersiz kelime oranı: ${(lexicalRichness * 100).toFixed(0)}%).`,
        },
      ],
      communication: [
        {
          key: "pacing",
          label: "Tempo",
          score: pacingScore,
          detail: `Dolgu kelime yoğunluğu ve cevap ritmine göre hesaplandı (dolgu oranı: ${(fillerRatio * 100).toFixed(1)}%).`,
        },
      ],
      recommendations,
      notes: [
        "Rapor, mülakat bitirildiği ana kadar toplanan aday cevapları üzerinden üretildi.",
        "OpenAI erişimi yoksa metin tabanlı dinamik heuristik değerlendirme kullanılır.",
      ],
    };
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}
