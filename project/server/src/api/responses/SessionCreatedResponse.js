export class SessionCreatedResponse {
  static toSdp(session) {
    return session.answerSdp;
  }

  static toView(session) {
    return {
      sessionId: session.id,
      state: session.state,
      config: session.config,
      consent: session.consent,
    };
  }
}
