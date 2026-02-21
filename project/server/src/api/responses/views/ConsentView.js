export class ConsentView {
  static fromConsent(consent) {
    return {
      microphone: Boolean(consent?.microphone),
      camera: Boolean(consent?.camera),
      timestamp: consent?.timestamp ? new Date(consent.timestamp).toISOString() : null,
    };
  }
}
