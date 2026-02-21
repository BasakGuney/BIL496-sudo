export class TurnView {
  static fromTurn(turn) {
    return {
      turnIndex: Number(turn?.turnIndex || 1),
      questionText: String(turn?.questionText || ""),
      sessionId: String(turn?.sessionId || ""),
    };
  }
}
