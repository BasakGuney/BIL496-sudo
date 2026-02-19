export class VisionSignals {
  constructor({ focusScore = 70, smileRatio = 0.2, headMovementScore = 70 } = {}) {
    this.focusScore = focusScore;
    this.smileRatio = smileRatio;
    this.headMovementScore = headMovementScore;
  }
}
