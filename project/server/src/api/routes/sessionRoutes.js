import { Router } from "express";

export function createSessionRouter({ sessionController }) {
  const router = Router();

  router.post("/session", sessionController.createSession);
  router.patch("/session/:sessionId/consent", sessionController.updateConsent);
  router.post("/session/:sessionId/start", sessionController.startSession);
  router.post("/session/:sessionId/end", sessionController.endSession);

  // backward-compatible endpoint used by current client
  router.post("/session/:sessionId/report", sessionController.createReport);
  router.get("/session/:sessionId/report", sessionController.getReport);

  return router;
}
