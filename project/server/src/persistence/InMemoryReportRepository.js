import { ReportRepository } from "./ReportRepository.js";

export class InMemoryReportRepository extends ReportRepository {
  constructor() {
    super();
    this.store = new Map();
  }

  async save(report) { this.store.set(report.sessionId, report); }
  async findBySessionId(sessionId) { return this.store.get(sessionId) || null; }
}
