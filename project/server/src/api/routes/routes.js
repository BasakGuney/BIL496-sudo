import express from "express";

export function createRoutes({ sessionController, consentController, realtimeController, reportController }) {
  const router = express.Router();

  router.post("/sessions", async (req, res, next) => { try { res.status(201).json(await sessionController.createSession(req)); } catch (e) { next(e); } });
  router.get("/sessions/:sessionId", async (req, res, next) => { try { res.json(await sessionController.getSession(req.params.sessionId)); } catch (e) { next(e); } });
  router.patch("/sessions/:sessionId/consent", async (req, res, next) => { try { res.json(await consentController.updateConsent(req.params.sessionId, req)); } catch (e) { next(e); } });
  router.post("/sessions/:sessionId/start", async (req, res, next) => { try { res.json(await sessionController.startSession(req.params.sessionId, req)); } catch (e) { next(e); } });
  router.post("/sessions/:sessionId/answers", async (req, res, next) => { try { res.json(await sessionController.recordAnswer(req.params.sessionId, req)); } catch (e) { next(e); } });
  router.post("/sessions/:sessionId/end", async (req, res, next) => { try { res.json(await sessionController.endSession(req.params.sessionId, req)); } catch (e) { next(e); } });
  router.get("/sessions/:sessionId/report", async (req, res, next) => { try { res.json(await reportController.getReport(req.params.sessionId)); } catch (e) { next(e); } });
  router.post("/sessions/:sessionId/realtime/offer", async (req, res, next) => { try { res.json(await realtimeController.postOffer(req.params.sessionId, req)); } catch (e) { next(e); } });

  // legacy endpoint compatibility
  router.post("/session", async (req, res, next) => {
    try {
      const session = await sessionController.createSession({ body: { mode: req.query.mode || "Neutral" } });
      await consentController.updateConsent(session.id, { body: { microphone: true, camera: true } });
      const answer = await realtimeController.postOffer(session.id, { body: { offerSdp: typeof req.body === "string" ? req.body : "" } });
      res.status(200).type("application/sdp").send(answer.sdp);
    } catch (e) { next(e); }
  });

  return router;
}
