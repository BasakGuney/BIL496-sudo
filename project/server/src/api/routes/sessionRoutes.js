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

  // Consent
  router.patch("/session/:sessionId/consent", consentController.updateConsent);

  // Realtime signaling
  router.post("/realtime/offer", realtimeController.createOfferAnswer);

  // Report
  router.post("/session/:sessionId/answer", reportController.ingestCandidateAnswer);
  router.post("/session/:sessionId/end", reportController.endSessionAndCreateReport);
  router.post("/session/:sessionId/report", reportController.endSessionAndCreateReport); // backward compatibility
  router.get("/session/:sessionId/report", reportController.getReport);

  return router;
}
