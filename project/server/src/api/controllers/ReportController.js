import { ReportView } from "../../dto/responses/views/ReportView.js";

export class ReportController {
  constructor({ backendOrchestrator }) {
    this.backendOrchestrator = backendOrchestrator;
    this.getReport = this.getReport.bind(this);
    this.endSessionAndCreateReport = this.endSessionAndCreateReport.bind(this);
    this.ingestCandidateAnswer = this.ingestCandidateAnswer.bind(this);
  }

  async getReport(req, res, next) {
    try {
      const report = await this.backendOrchestrator.getReport(req.params.sessionId);
      res.json(ReportView.fromReport(report));
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
}
