export class SessionUpdateBuilder {
  constructor(turnPolicy) {
    this.turnPolicy = turnPolicy;
  }

  buildSessionCreate(cfg) {
    return {
      mode: cfg.mode,
      instructions: `Interview type: ${cfg.interviewType}, role: ${cfg.role}`,
      turn_detection: this.turnPolicy.buildServerVad(),
    };
  }

  buildSessionUpdate(cfg) {
    return {
      session: this.buildSessionCreate(cfg),
    };
  }
}
