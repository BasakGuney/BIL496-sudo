export class AudioSignals {
  constructor({ fillerCount = 0, speechRateWpm = 0, pauseRatio = 0 } = {}) {
    this.fillerCount = fillerCount;
    this.speechRateWpm = speechRateWpm;
    this.pauseRatio = pauseRatio;
  }
}
