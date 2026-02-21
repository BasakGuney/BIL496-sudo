import { ReportView } from "../responses/views/ReportView.js";

export class ReportController {
  constructor({ backendOrchestrator }) {
    this.backendOrchestrator = backendOrchestrator;
    this.getReport = this.getReport.bind(this);
    this.endSessionAndCreateReport = this.endSessionAndCreateReport.bind(this);
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
        req.body?.transcript || []
      );
      res.json(ReportView.fromReport(report));
    } catch (error) {
      next(error);
    }
  }
}
