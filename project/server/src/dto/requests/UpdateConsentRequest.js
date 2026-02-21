export class UpdateConsentRequest {
  constructor({ microphone, camera }) {
    this.microphone = Boolean(microphone);
    this.camera = Boolean(camera);
  }

  static fromExpress(req) {
    return new UpdateConsentRequest({
      microphone: req.body?.microphone,
      camera: req.body?.camera,
    });
  }
}
