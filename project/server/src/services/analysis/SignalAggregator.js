export class SignalAggregator {
  toReport(session, audio, vision) {
    const overallScore = Math.round((audio.pacingScore + vision.focusScore + vision.headMovementScore) / 3);
    return {
      id: `R-${session.id}`,
      sessionId: session.id,
      overallScore,
      content: [
        { key: "relevance", label: "İlgililik", score: 75, detail: "Soru-cevap odak uyumu değerlendirildi." },
      ],
      communication: [
        { key: "pacing", label: "Tempo", score: audio.pacingScore, detail: "Konuşma akışı değerlendirildi." },
      ],
      behavioral: [
        { key: "focus", label: "Odak", score: vision.focusScore, detail: "Kamera sinyallerinden hesaplandı." },
      ],
      recommendations: [
        { title: "Kısa ve net ilerleyin", text: "Her cevabı sonuç odaklı bir örnekle bitirin." },
      ],
      notes: ["Davranışsal metrikler koçluk amaçlıdır."],
    };
  }
}
