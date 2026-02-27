import { Router } from "express";

export function createSessionRouter({ sessionController }) {
  const router = Router();
  router.post("/session", sessionController.createSession);
  router.post("/session/:sessionId/transcript-entry", sessionController.appendTranscriptEntry);
  router.post("/session/:sessionId/report", sessionController.createReport);
  return router;
}
