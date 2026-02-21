export class TranscriptEvaluator {
  constructor({ apiKey, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async evaluate({ sessionId, transcript }) {
    const safeTranscript = Array.isArray(transcript) ? transcript : [];
    const qaPairs = this.buildQAPairs(safeTranscript);

    if (qaPairs.length === 0) {
      return {
        sessionId,
        qaEvaluations: [],
        overallScore: 50,
        content: [
          {
            key: "relevance",
            label: "İlgililik",
            score: 50,
            detail: "Soru-cevap çifti oluşmadığı için detaylı içerik analizi yapılamadı.",
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
            title: "En az bir soruya tam cevap verin",
            text: "Raporun daha doğru olması için bitirmeden önce en az bir soruya net örnekli cevap verin.",
          },
        ],
        notes: [
          "Mülakat erken sonlandırıldığı için soru-cevap çifti yakalanamadı; rapor minimum veriyle üretildi.",
        ],
      };
    }

    const heuristicReport = this.buildHeuristicReport({ sessionId, qaPairs });
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
                "Türkçe mülakat değerlendirme uzmanısın. Verilen soru-cevap çiftleri için sadece geçerli JSON döndür. Şema: {overallScore:number, content:[{key,label,score,detail}], communication:[{key,label,score,detail}], recommendations:[{title,text}], notes:string[], qaEvaluations:[{index:number,question:string,answer:string,relevance:number,clarity:number,summary:string}] }",
            },
            {
              role: "user",
              content: JSON.stringify({ qaPairs, transcript: safeTranscript }),
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
      return {
        sessionId,
        qaEvaluations: Array.isArray(parsed.qaEvaluations) ? parsed.qaEvaluations : heuristicReport.qaEvaluations,
        ...parsed,
      };
    } catch (_error) {
      return heuristicReport;
    }
  }

  buildQAPairs(transcript) {
    const normalized = transcript
      .filter((item) => item?.role === "interviewer" || item?.role === "candidate")
      .map((item) => ({
        role: item.role,
        text: String(item.text || "").trim(),
        ts: Number(item.ts || Date.now()),
      }))
      .filter((item) => item.text.length > 0)
      .sort((a, b) => a.ts - b.ts);

    const pairs = [];
    let pendingQuestion = null;

    for (const turn of normalized) {
      if (turn.role === "interviewer") {
        // Yeni soru geldiyse, önceki cevaplanmamış soruyu düşürüp son soruyu beklet.
        pendingQuestion = turn.text;
        continue;
      }

      if (turn.role === "candidate") {
        if (!pendingQuestion) continue;
        pairs.push({ question: pendingQuestion, answer: turn.text });
        pendingQuestion = null;
      }
    }

    return pairs;
  }

  buildHeuristicReport({ sessionId, qaPairs }) {
    const qaEvaluations = qaPairs.map((pair, index) => {
      const words = pair.answer.split(/\s+/).filter(Boolean);
      const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
      const fillerRegex = /\b(ıı+|eee+|şey|yani|hımm|hmm|bilmiyorum)\b/gi;
      const fillerCount = (pair.answer.match(fillerRegex) || []).length;
      const fillerRatio = words.length ? fillerCount / words.length : 0;
      const lexicalRichness = words.length ? uniqueWords.size / words.length : 0;

      const relevance = this.clamp(
        Math.round(50 + Math.min(28, words.length * 1.1) + Math.min(10, lexicalRichness * 25)),
        40,
        96
      );
      const clarity = this.clamp(
        Math.round(52 + Math.min(24, lexicalRichness * 40) - Math.min(12, fillerRatio * 120)),
        35,
        94
      );

      const summary =
        relevance >= 75 && clarity >= 75
          ? "Soruya odaklı ve net bir cevap verildi."
          : relevance < 70
          ? "Cevap soru odağından kısmen uzaklaştı; daha doğrudan yanıt önerilir."
          : "Cevap ilgili ancak ifade netliği geliştirilebilir.";

      return {
        index: index + 1,
        question: pair.question,
        answer: pair.answer,
        relevance,
        clarity,
        summary,
      };
    });

    const avgRelevance = Math.round(
      qaEvaluations.reduce((sum, item) => sum + item.relevance, 0) / qaEvaluations.length
    );
    const avgClarity = Math.round(
      qaEvaluations.reduce((sum, item) => sum + item.clarity, 0) / qaEvaluations.length
    );

    const allAnswersText = qaPairs.map((p) => p.answer).join(" ");
    const allWords = allAnswersText.split(/\s+/).filter(Boolean);
    const allFillerCount = (allAnswersText.match(/\b(ıı+|eee+|şey|yani|hımm|hmm|bilmiyorum)\b/gi) || [])
      .length;
    const fillerRatio = allWords.length ? allFillerCount / allWords.length : 0;

    const pacingScore = this.clamp(Math.round(74 - Math.min(24, fillerRatio * 140)), 36, 94);
    const overallScore = Math.round((avgRelevance + avgClarity + pacingScore) / 3);

    const recommendations = [];
    if (avgRelevance < 72) {
      recommendations.push({
        title: "Soruyu yeniden çerçevele",
        text: "Her yanıta soruyu bir cümleyle tekrar ederek başlayın, sonra örneğe geçin.",
      });
    }
    if (avgClarity < 72) {
      recommendations.push({
        title: "Netlik artırma",
        text: "Cevapları 'durum -> yaptığım aksiyon -> ölçülebilir sonuç' sırasıyla verin.",
      });
    }
    if (pacingScore < 70) {
      recommendations.push({
        title: "Dolgu kelime azaltma",
        text: "Düşünürken 1 saniye durup ardından kısa cümlelerle konuşun.",
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Tutarlılığı koru",
        text: "Aynı cevap kalitesini sürdürüp kritik örneklerde sayısal çıktı vermeye devam edin.",
      });
    }

    return {
      sessionId,
      qaEvaluations,
      overallScore,
      content: [
        {
          key: "relevance",
          label: "İlgililik",
          score: avgRelevance,
          detail: `${qaPairs.length} soru-cevap çifti üzerinden soruya bağlılık analizi yapıldı.`,
        },
        {
          key: "clarity",
          label: "Netlik",
          score: avgClarity,
          detail: "Her cevap için ifade açıklığı ve kelime çeşitliliği ölçüldü.",
        },
      ],
      communication: [
        {
          key: "pacing",
          label: "Tempo",
          score: pacingScore,
          detail: `Toplam dolgu kelime oranına göre hesaplandı (${(fillerRatio * 100).toFixed(1)}%).`,
        },
      ],
      recommendations,
      notes: [
        "Rapor, mülakat bitirildiği ana kadar yakalanan her soru-cevap çiftiyle üretildi.",
        "OpenAI erişimi yoksa soru-cevap bazlı dinamik heuristik değerlendirme kullanılır.",
      ],
    };
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}
