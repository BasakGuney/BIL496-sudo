import { Router } from "express";

export function createSessionRouter({ sessionController }) {
  const router = Router();
  router.post("/session", sessionController.createSession);
  return router;
}
