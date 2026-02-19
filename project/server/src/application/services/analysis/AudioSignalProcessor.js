import { AudioSignals } from "./AudioSignals.js";

export class AudioSignalProcessor {
  analyze(transcript, durationSec) {
    const words = transcript.trim().split(/\s+/).filter(Boolean);
    const fillerCount = words.filter((w) => ["şey", "yani", "eee"].includes(w.toLowerCase())).length;
    const speechRateWpm = durationSec > 0 ? Math.round((words.length / durationSec) * 60) : 0;
    const pauseRatio = fillerCount > 0 ? Math.min(0.5, fillerCount / Math.max(1, words.length)) : 0.1;
    return new AudioSignals({ fillerCount, speechRateWpm, pauseRatio });
  }
}
