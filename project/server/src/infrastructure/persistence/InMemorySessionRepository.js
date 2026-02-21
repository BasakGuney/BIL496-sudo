import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";

export class InMemorySessionRepository extends ISessionRepository {
  constructor() {
    super();
    this.store = new Map();
  }

  async create(session) {
    this.store.set(session.id, session);
  }

  async findById(id) {
    return this.store.get(id) || null;
  }

  async update(session) {
    this.store.set(session.id, session);
  }
}
