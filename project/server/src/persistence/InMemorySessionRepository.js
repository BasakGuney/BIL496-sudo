import { SessionRepository } from "./SessionRepository.js";

export class InMemorySessionRepository extends SessionRepository {
  constructor() {
    super();
    this.store = new Map();
  }

  async create(session) { this.store.set(session.id, session); }
  async update(session) { this.store.set(session.id, session); }
  async findById(id) { return this.store.get(id) || null; }
}
