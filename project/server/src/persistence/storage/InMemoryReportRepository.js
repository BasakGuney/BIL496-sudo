import { IReportRepository } from "../repositories/IReportRepository.js";

export class InMemoryReportRepository extends IReportRepository {
  constructor() {
    super();
    this.store = new Map();
  }

  async save(report) {
    this.store.set(report.sessionId, report);
  }

  async findBySessionId(sessionId) {
    return this.store.get(sessionId) || null;
  }
}
