export class BehaviorAnalyzer {
  constructor(audio, vision, agg) {
    this.audio = audio;
    this.vision = vision;
    this.agg = agg;
  }

  async generateReport(session) {
    const transcript = session.answerTurns.map((t) => t.transcript).join(" ");
    const totalDuration = session.answerTurns.reduce((sum, t) => sum + t.durationSec, 0);
    const audioSignals = this.audio.analyze(transcript, totalDuration);
    const visionSignals = this.vision.analyze(null);
    return this.agg.toReport(session, audioSignals, visionSignals);
  }
}
