import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";

export class InMemorySessionRepository extends ISessionRepository {
  constructor() {
    super();
    this.store = new Map();
  }

  create(session) {
    this.store.set(session.id, session);
    return session;
  }

  findById(id) {
    return this.store.get(id) || null;
  }

  update(session) {
    this.store.set(session.id, session);
    return session;
  }
}
