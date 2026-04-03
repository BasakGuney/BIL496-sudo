export class BehaviorAnalyzer {
  constructor({ transcriptSignalProcessor, visionSignalProcessor, interviewSignalAggregator, transcriptEvaluator }) {
    this.transcriptSignalProcessor = transcriptSignalProcessor;
    this.visionSignalProcessor = visionSignalProcessor;
    this.interviewSignalAggregator = interviewSignalAggregator;
    this.transcriptEvaluator = transcriptEvaluator;
  }

  async generateReport(session, transcript, visionAnalysis = null) {
    const transcriptBased = await this.transcriptEvaluator.evaluate({ sessionId: session.id, transcript, session });
    const audio = this.transcriptSignalProcessor.fromTranscript(transcript || []);
    const vision = this.visionSignalProcessor.fromSession(session, visionAnalysis);
    const merged = this.interviewSignalAggregator.toReport(session, audio, vision, visionAnalysis);
    return {
      ...merged,
      ...transcriptBased,
      sessionId: session.id,
      overallScore: transcriptBased.overallScore ?? merged.overallScore,
      visionAnalysis,
    };
  }
}
