export class SessionCreatedResponse {
  static toSdp(session) {
    return session.answerSdp;
  }
}
