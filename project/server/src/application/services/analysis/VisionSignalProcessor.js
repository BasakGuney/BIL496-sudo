import { VisionSignals } from "./VisionSignals.js";

export class VisionSignalProcessor {
  analyze(videoRef) {
    if (!videoRef) {
      return new VisionSignals({ focusScore: 60, smileRatio: 0.1, headMovementScore: 65 });
    }
    return new VisionSignals();
  }
}
