import { PromptTemplates } from "../ai/PromptTemplates.js";

export class TranscriptEvaluator {
  constructor({ apiKey, fetchImpl = fetch, promptTemplates = new PromptTemplates() }) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.promptTemplates = promptTemplates;
  }

  async evaluate({ sessionId, transcript, session = {} }) {
    const safeTranscript = Array.isArray(transcript) ? transcript : [];
    const qaPairs = this.buildQAPairs(safeTranscript);

    if (qaPairs.length === 0) {
      const fallbackPairs = this.buildFallbackPairsFromTranscript(safeTranscript);
      if (fallbackPairs.length > 0) {
        return this.buildHeuristicReport({ sessionId, qaPairs: fallbackPairs, interviewType: session.config?.interviewType });
      }

      return {
        sessionId,
        qaEvaluations: [],
        overallScore: 55,
        content: [
          {
            key: "relevance",
            label: "İlgililik",
            score: 55,
            detail: "Soru-cevap eşlemesi otomatik yapılamadı; ham transcript kayıt altına alındı.",
          },
        ],
        communication: [
          {
            key: "pacing",
            label: "Tempo",
            score: 55,
            detail: "Mülakat erken sonlandırıldı veya eşleşme sınırlıydı; mevcut konuşma metni üzerinden temel değerlendirme yapıldı.",
          },
        ],
        recommendations: [
          {
            title: "Kısa bir kapanış cevabı daha verin",
            text: "Rapor doğruluğunu artırmak için bitirmeden önce son soruya 1-2 cümlelik net bir cevap verin.",
          },
        ],
        notes: [
          "Transcript saklandı. Soru-cevap eşleşmesi oluşmadığı için özet değerlendirme üretildi.",
        ],
      };
    }

    const heuristicReport = this.buildHeuristicReport({ sessionId, qaPairs, interviewType: session.config?.interviewType });
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
              content: this.promptTemplates.transcriptEvaluationSystemPrompt(session.config?.interviewType),
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
    let pendingQuestionTs = null;

    for (const turn of normalized) {
      if (turn.role === "interviewer") {
        // Yeni soru geldiyse, önceki cevaplanmamış soruyu düşürüp son soruyu beklet.
        pendingQuestion = turn.text;
        pendingQuestionTs = turn.ts;
        continue;
      }

      if (turn.role === "candidate") {
        if (!pendingQuestion) continue;
        pairs.push({
          question: pendingQuestion,
          answer: turn.text,
          questionTs: pendingQuestionTs || turn.ts,
          answerTs: turn.ts,
        });
        pendingQuestion = null;
        pendingQuestionTs = null;
      }
    }

    return pairs;
  }

  buildFallbackPairsFromTranscript(transcript) {
    const normalized = transcript
      .filter((item) => item?.role === "interviewer" || item?.role === "candidate")
      .map((item) => ({
        role: item.role,
        text: String(item.text || "").trim(),
        ts: Number(item.ts || Date.now()),
      }))
      .filter((item) => item.text.length > 0)
      .sort((a, b) => a.ts - b.ts);

    const interviewerTurns = normalized.filter((turn) => turn.role === "interviewer");
    const candidateTurns = normalized.filter((turn) => turn.role === "candidate");

    if (candidateTurns.length === 0) return [];

    if (interviewerTurns.length === 0) {
      return candidateTurns.map((turn, index) => ({
        question: `Soru ${index + 1}`,
        answer: turn.text,
        questionTs: Math.max(0, turn.ts - 1000),
        answerTs: turn.ts,
      }));
    }

    const pairs = [];
    let qIndex = 0;

    for (const answer of candidateTurns) {
      while (
        qIndex + 1 < interviewerTurns.length &&
        interviewerTurns[qIndex + 1].ts <= answer.ts
      ) {
        qIndex += 1;
      }

      const question = interviewerTurns[qIndex];
      pairs.push({
        question: question?.text || `Soru ${pairs.length + 1}`,
        answer: answer.text,
        questionTs: question?.ts || Math.max(0, answer.ts - 1000),
        answerTs: answer.ts,
      });
    }

    return pairs;
  }

  buildHeuristicReport({ sessionId, qaPairs, interviewType = "Technical" }) {
    const qaEvaluations = qaPairs.map((pair, index) => {
      const words = pair.answer.split(/\s+/).filter(Boolean);
      const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
      const fillerCount = this.countFillers(pair.answer);
      const fillerRatio = words.length ? fillerCount / words.length : 0;
      const lexicalRichness = words.length ? uniqueWords.size / words.length : 0;
      const durationSec = Math.max(0, Math.round((pair.answerTs - pair.questionTs) / 1000));
      const timeLimitSec = this.extractTimeLimitSec(pair.question);
      const exceededTimeLimit = durationSec > timeLimitSec;

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
        durationSec,
        timeLimitSec,
        exceededTimeLimit,
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
    const allFillerCount = this.countFillers(allAnswersText);
    const fillerRatio = allWords.length ? allFillerCount / allWords.length : 0;

    const exceededCount = qaEvaluations.filter((item) => item.exceededTimeLimit).length;
    const overrunRatio = qaEvaluations.length ? exceededCount / qaEvaluations.length : 0;

    const pacingScore = this.clamp(
      Math.round(74 - Math.min(24, fillerRatio * 140) - Math.min(10, overrunRatio * 30)),
      36,
      94
    );
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
          label: interviewType === "HR" ? "İletişim ve Empati" : "İlgililik",
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
          detail: `Dolgu kelime oranı (${(fillerRatio * 100).toFixed(1)}%) ve süre aşımı (${exceededCount}/${qaEvaluations.length}) birlikte değerlendirildi.`,
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

  countFillers(text = "") {
    const tokens = String(text || "")
      .toLocaleLowerCase("tr-TR")
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
      .filter(Boolean);

    const fillerTokenRegex = /^(?:[ıi]{2,}|[ae]{2,}|h+[ıi]?m+|ş+e+y+|y+a+n+i+|b+i+l+m+i+y+o+r+u+m+|h+a+n+i+|i+ş+t+e+)$/u;
    return tokens.reduce((sum, token) => {
      const compact = token.replace(/(.)\1{2,}/gu, "$1$1");
      return sum + (fillerTokenRegex.test(compact) ? 1 : 0);
    }, 0);
  }

  extractTimeLimitSec(questionText) {
    const text = String(questionText || "").toLowerCase();
    const minuteMatch = text.match(/(\d{1,2})\s*dakika/);
    if (minuteMatch) {
      return Number(minuteMatch[1]) * 60;
    }

    const secondMatch = text.match(/(\d{1,3})\s*saniye/);
    if (secondMatch) {
      return Number(secondMatch[1]);
    }

    return 90;
  }
}
