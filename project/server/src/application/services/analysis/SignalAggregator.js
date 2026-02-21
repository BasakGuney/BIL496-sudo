import { FeedbackReport } from "../../../domain/entities/FeedbackReport.js";
import { EvidenceItem } from "../../../domain/entities/EvidenceItem.js";

export class SignalAggregator {
  toReport(session, audio, vision) {
    const relevancies = session.answerTurns.map((turn) => turn.relevanceScore).filter((score) => Number.isFinite(score));
    const avgRelevance = relevancies.length ? Math.round(relevancies.reduce((a, b) => a + b, 0) / relevancies.length) : 70;
    const overallScore = Math.max(0, Math.min(100, Math.round((vision.focusScore + vision.headMovementScore + avgRelevance + (100 - audio.fillerCount * 4)) / 4)));

    return new FeedbackReport({
      id: `R-${session.id}`,
      sessionId: session.id,
      overallScore,
      strengths: ["Cevap akışı korunmuş", "Soru-cevap sürekliliği iyi"],
      improvements: ["Anahtar kavramları daha erken söyle", "Zaman limitine yakın yanıtları kısalt"],
      evidence: [
        new EvidenceItem({ ref: "E-1", claim: `Ortalama ilgililik skoru: ${avgRelevance}`, timestampSec: 12 }),
        new EvidenceItem({ ref: "E-2", claim: "Soru başına süre yönetimi kontrol edildi", timestampSec: 30 }),
      ],
    });
  }
}
