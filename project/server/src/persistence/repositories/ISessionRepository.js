export class ISessionRepository {
  async create(_session) {
    throw new Error("create must be implemented");
  }

  async update(_session) {
    throw new Error("update must be implemented");
  }

  async findById(_id) {
    throw new Error("findById must be implemented");
  }
}
