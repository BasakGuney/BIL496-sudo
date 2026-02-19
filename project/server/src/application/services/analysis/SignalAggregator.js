import { FeedbackReport } from "../../../domain/entities/FeedbackReport.js";
import { EvidenceItem } from "../../../domain/entities/EvidenceItem.js";

export class SignalAggregator {
  toReport(session, audio, vision) {
    const overallScore = Math.max(0, Math.min(100, Math.round((vision.focusScore + vision.headMovementScore + (100 - audio.fillerCount * 5)) / 3)));
    return new FeedbackReport({
      id: `R-${session.id}`,
      sessionId: session.id,
      overallScore,
      strengths: ["Cevap yapısı genel olarak tutarlı", "Sözlü akış anlaşılır"],
      improvements: ["Dolgu kelime kullanımını azalt", "Anahtar mesajı daha erken belirt"],
      evidence: [new EvidenceItem({ ref: "E-1", claim: "Duraksama oranı ölçüldü", timestampSec: 12 })],
    });
  }
}
