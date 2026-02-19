export function toSessionView(session) {
  return {
    id: session.id,
    state: session.state,
    config: { ...session.config },
    consent: {
      microphone: session.consent.microphone,
      camera: session.consent.camera,
      timestamp: session.consent.timestamp?.toISOString?.() || new Date().toISOString(),
    },
    preparedQuestions: session.preparedQuestions,
    previewQuestions: session.preparedQuestions.slice(0, 2),
  };
}

export function toReportView(report) {
  return {
    sessionId: report.sessionId,
    overallScore: report.overallScore,
    strengths: report.strengths,
    improvements: report.improvements,
    evidence: report.evidence,
  };
}

export function toSdpAnswerView(sdp) {
  return { sdp };
}
