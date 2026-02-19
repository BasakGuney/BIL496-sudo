import crypto from "node:crypto";

export class IdGenerator {
  newId() {
    return crypto.randomUUID();
  }
}
