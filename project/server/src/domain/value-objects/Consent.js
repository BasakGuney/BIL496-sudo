export class Consent {
  constructor({ microphone = false, camera = false, timestamp = new Date() } = {}) {
    this.microphone = Boolean(microphone);
    this.camera = Boolean(camera);
    this.timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now());
  }
}
