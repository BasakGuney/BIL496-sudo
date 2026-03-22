export class BehaviorAnalyzer {
  constructor({ audioSignalProcessor, visionSignalProcessor, signalAggregator, transcriptEvaluator }) {
    this.audioSignalProcessor = audioSignalProcessor;
    this.visionSignalProcessor = visionSignalProcessor;
    this.signalAggregator = signalAggregator;
    this.transcriptEvaluator = transcriptEvaluator;
  }

  async generateReport(session, transcript, visionAnalysis = null) {
    const transcriptBased = await this.transcriptEvaluator.evaluate({ sessionId: session.id, transcript, session });
    const audio = this.audioSignalProcessor.fromTranscript(transcript || []);
    const vision = this.visionSignalProcessor.fromSession(session, visionAnalysis);
    const merged = this.signalAggregator.toReport(session, audio, vision, visionAnalysis);
    return {
      ...merged,
      ...transcriptBased,
      sessionId: session.id,
      overallScore: transcriptBased.overallScore ?? merged.overallScore,
      visionAnalysis,
    };
  }
}
