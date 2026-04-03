import { EvidenceItemView } from "./EvidenceItemView.js";

export class ReportView {
  static buildAnalysisNotes(feedbackArtifacts = {}) {
    const notes = [];

    if (!feedbackArtifacts?.audioModel) {
      notes.push("Ses analizi henüz hazır değil veya analiz sırasında hata oluştu.");
    }

    if (!feedbackArtifacts?.audioLlmReport) {
      notes.push("Ses LLM yorumu üretilemedi. Ham ses metrikleriyle devam ediliyor.");
    }

    if (!feedbackArtifacts?.transcriptAnalysis) {
      notes.push("Transcript analizi henüz hazır değil.");
    } else if (feedbackArtifacts.transcriptAnalysis?.status === "skipped") {
      const reason = String(feedbackArtifacts.transcriptAnalysis?.reason || "").trim();
      notes.push(
        reason
          ? `Transcript analizi atlandı: ${reason}`
          : "Transcript analizi atlandı."
      );
    }

    const visionStatus = String(feedbackArtifacts?.visionAnalysis?.status || "").toLowerCase();
    if (!feedbackArtifacts?.visionAnalysis) {
      notes.push("Görüntü analizi mevcut değil.");
    } else if (visionStatus === "unavailable" || visionStatus === "limited") {
      const rawMessage =
        feedbackArtifacts?.visionAnalysis?.message
        || feedbackArtifacts?.visionAnalysis?.diagnostics?.detector?.fallbackReason
        || "";
      const detail = String(rawMessage || "").trim();
      notes.push(
        detail
          ? `Görüntü analizi sınırlı/erişilemedi: ${detail}`
          : "Görüntü analizi sınırlı veya erişilemedi."
      );
    }

    if (!feedbackArtifacts?.visionLlmAnalysis) {
      notes.push("Görüntü LLM yorumu henüz hazır değil veya üretilemedi.");
    }

    return [...new Set(notes)];
  }

  static fromReport(report) {
    const feedbackArtifacts = report?.feedbackArtifacts || {};
    const analysisNotes = this.buildAnalysisNotes(feedbackArtifacts);
    const mergedNotes = [...(Array.isArray(report?.notes) ? report.notes : []), ...analysisNotes];

    return {
      id: report?.id || `R-${report?.sessionId || "unknown"}`,
      sessionId: report?.sessionId || "",
      overallScore: Number(report?.overallScore || 0),
      content: report?.content || [],
      communication: report?.communication || [],
      behavioral: report?.behavioral || [],
      recommendations: report?.recommendations || [],
      notes: [...new Set(mergedNotes)],
      qaEvaluations: report?.qaEvaluations || [],
      transcript: Array.isArray(report?.transcript) ? report.transcript : [],
      transcriptText: feedbackArtifacts?.transcriptText || report?.transcriptText || "",
      visionAnalysis: feedbackArtifacts?.visionAnalysis || report?.visionAnalysis || null,
      audioAnalysis: {
        model: feedbackArtifacts?.audioModel || null,
      },
      audioLlmReport: feedbackArtifacts?.audioLlmReport || null,
      transcriptAnalysis: feedbackArtifacts?.transcriptAnalysis || null,
      visionLlmAnalysis: feedbackArtifacts?.visionLlmAnalysis || null,
      scoreMeta: feedbackArtifacts?.scoreMeta || null,
      analysisStatus: {
        audio: Boolean(feedbackArtifacts?.audioModel),
        audioLlm: Boolean(feedbackArtifacts?.audioLlmReport),
        transcript: Boolean(feedbackArtifacts?.transcriptAnalysis),
        vision: Boolean(feedbackArtifacts?.visionAnalysis),
        visionLlm: Boolean(feedbackArtifacts?.visionLlmAnalysis),
      },
      analysisNotes,
      evidence: Array.isArray(report?.evidence)
        ? report.evidence.map((item) => EvidenceItemView.fromEvidenceItem(item))
        : [],
    };
  }
}
