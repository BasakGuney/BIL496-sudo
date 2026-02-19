import { toReportView } from "../responses/views.js";

export class ReportController {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  async getReport(sessionId) {
    const report = await this.orchestrator.getReport(sessionId);
    return toReportView(report);
  }
}
