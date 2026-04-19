import { Router } from "express";

export function createSessionRouter({
  sessionController,
  consentController,
  realtimeController,
  reportController,
}) {
  const router = Router();

  // Session lifecycle
  router.post("/session", sessionController.createSession);
  router.post("/session/:sessionId/start", sessionController.startSession);
  router.patch("/session/:sessionId/config", sessionController.updateSessionConfig);
  router.post("/preview-questions", sessionController.generatePreviewQuestions);
  
  // Supportive Mode
  router.post("/session/:sessionId/supportive/hints", sessionController.generateLiveHints);
  router.post("/session/:sessionId/supportive/feedback", sessionController.generateLiveFeedback);
  router.post("/session/:sessionId/usage", sessionController.recordUsage);

  // Consent
  router.patch("/session/:sessionId/consent", consentController.updateConsent);

  // Realtime signaling
  router.post("/realtime/offer", realtimeController.createOfferAnswer);

  // Report
  router.get("/reports", reportController.listReports);
  router.get("/reports/history-insights", reportController.getHistoryInsights);
  router.post("/session/:sessionId/answer", reportController.ingestCandidateAnswer);
  router.post("/session/:sessionId/policy/enforcement", reportController.recordRealtimePolicyEnforcement);
  router.post("/session/:sessionId/policy/observation", reportController.observeRealtimePolicyOutcome);
  router.post("/session/:sessionId/vision/frame", reportController.ingestVisionFrame);
  router.post("/session/:sessionId/end", reportController.endSessionAndCreateReport);
  router.post("/session/:sessionId/report", reportController.endSessionAndCreateReport); // backward compatibility
  router.get("/session/:sessionId/report", reportController.getReport);
  router.post("/session/:sessionId/mock-audio-llm", reportController.mockAudioLlm);

  return router;
}
