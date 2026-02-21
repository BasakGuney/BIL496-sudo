export class IReportRepository {
  async save(_report) {
    throw new Error("save must be implemented");
  }

  async findBySessionId(_sessionId) {
    throw new Error("findBySessionId must be implemented");
  }
}
