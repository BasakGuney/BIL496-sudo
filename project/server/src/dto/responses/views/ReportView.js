import { EvidenceItemView } from "./EvidenceItemView.js";

export class ReportView {
  static fromReport(report) {
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
      evidence: Array.isArray(report?.evidence)
        ? report.evidence.map((item) => EvidenceItemView.fromEvidenceItem(item))
        : [],
    };
  }
}
