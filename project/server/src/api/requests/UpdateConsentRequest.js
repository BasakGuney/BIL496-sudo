import { Consent } from "../../domain/entities/Consent.js";

export class UpdateConsentRequest {
  constructor(payload = {}) {
    this.microphone = payload.microphone;
    this.camera = payload.camera;
  }

  toConsent() {
    return new Consent({ microphone: this.microphone, camera: this.camera, timestamp: new Date() });
  }
}
