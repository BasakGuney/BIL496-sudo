import { ReportView } from "../../dto/responses/views/ReportView.js";

export class ReportController {
  constructor({ backendOrchestrator }) {
    this.backendOrchestrator = backendOrchestrator;
    this.getReport = this.getReport.bind(this);
    this.listReports = this.listReports.bind(this);
    this.getHistoryInsights = this.getHistoryInsights.bind(this);
    this.endSessionAndCreateReport = this.endSessionAndCreateReport.bind(this);
    this.ingestCandidateAnswer = this.ingestCandidateAnswer.bind(this);
    this.ingestVisionFrame = this.ingestVisionFrame.bind(this);
    this.mockAudioLlm = this.mockAudioLlm.bind(this);
    this.recordRealtimePolicyEnforcement = this.recordRealtimePolicyEnforcement.bind(this);
    this.observeRealtimePolicyOutcome = this.observeRealtimePolicyOutcome.bind(this);
  }

  async getReport(req, res, next) {
    try {
      const report = await this.backendOrchestrator.getReport(req.params.sessionId);
      res.json(ReportView.fromReport(report));
    } catch (error) {
      next(error);
    }
  }

  async listReports(req, res, next) {
    try {
      const limit = Number(req.query?.limit || 50);
      const items = await this.backendOrchestrator.listReports({ limit });
      res.json({ items });
    } catch (error) {
      next(error);
    }
  }

  async getHistoryInsights(req, res, next) {
    try {
      const limit = Number(req.query?.limit || 3);
      const insights = await this.backendOrchestrator.getHistoryInsights({ limit });
      res.json(insights);
    } catch (error) {
      next(error);
    }
  }

  async endSessionAndCreateReport(req, res, next) {
    try {
      const report = await this.backendOrchestrator.endSession(
        req.params.sessionId,
        req.body?.reason || null,
        req.body?.transcript || [],
        req.body?.candidateAnswerAudios || [],
        req.body?.visionAnalysis || null
      );
      res.json(ReportView.fromReport(report));
    } catch (error) {
      next(error);
    }
  }

  async ingestCandidateAnswer(req, res, next) {
    try {
      const result = await this.backendOrchestrator.ingestCandidateAnswer(
        req.params.sessionId,
        req.body?.candidateAnswerAudio || req.body || null
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async ingestVisionFrame(req, res, next) {
    try {
      const result = await this.backendOrchestrator.ingestVisionFrame(req.params.sessionId, req.body || {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async recordRealtimePolicyEnforcement(req, res, next) {
    try {
      const result = await this.backendOrchestrator.recordRealtimePolicyEnforcement(req.params.sessionId, req.body || {});
      res.json({ policy: result });
    } catch (error) {
      next(error);
    }
  }

  async observeRealtimePolicyOutcome(req, res, next) {
    try {
      const result = await this.backendOrchestrator.observeRealtimePolicyOutcome(req.params.sessionId, req.body || {});
      res.json({ observation: result });
    } catch (error) {
      next(error);
    }
  }

  async mockAudioLlm(req, res, next) {
    try {
      const result = await this.backendOrchestrator.mockAudioLlm(req.params.sessionId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}
