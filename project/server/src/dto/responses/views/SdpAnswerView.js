export class SdpAnswerView {
  static fromSession(session) {
    return {
      answerSdp: session?.answerSdp || "",
    };
  }
}
