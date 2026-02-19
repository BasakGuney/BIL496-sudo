export class IdGenerator {
  newId(prefix = "id") {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  }
}
