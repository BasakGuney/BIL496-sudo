import { EvidenceItemView } from "./EvidenceItemView.js";

export class ReportView {
  static fromReport(report) {
    const feedbackArtifacts = report?.feedbackArtifacts || {};

    return {
      id: report?.id || `R-${report?.sessionId || "unknown"}`,
      sessionId: report?.sessionId || "",
      overallScore: Number(report?.overallScore || 0),
      content: report?.content || [],
      communication: report?.communication || [],
      behavioral: report?.behavioral || [],
      recommendations: report?.recommendations || [],
      notes: report?.notes || [],
      qaEvaluations: report?.qaEvaluations || [],
      transcript: Array.isArray(report?.transcript) ? report.transcript : [],
      transcriptText: feedbackArtifacts?.transcriptText || report?.transcriptText || "",
      visionAnalysis: feedbackArtifacts?.visionAnalysis || report?.visionAnalysis || null,
      audioAnalysis: {
        model: feedbackArtifacts?.audioModel || null,
        llmReport: feedbackArtifacts?.audioLlmReport || "",
      },
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
      evidence: Array.isArray(report?.evidence)
        ? report.evidence.map((item) => EvidenceItemView.fromEvidenceItem(item))
        : [],
    };
  }
}
