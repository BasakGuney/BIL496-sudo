export class VisionSignalProcessor {
  clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(Number(value || 0))));
  }

  fromSession(_session, visionAnalysis = null) {
    const overview = visionAnalysis?.overview || {};
    const tension = visionAnalysis?.tension || {};

    const facePresenceScore = this.clamp(Number(overview.facePresenceScore || 0));
    const framingScore = this.clamp(Number(overview.centeringScore || 0));
    const headMovementScore = this.clamp(Number(overview.steadinessScore || 0));
    const tensionScore = this.clamp(Number(tension.visualTensionScore || 0));
    const focusScore = this.clamp(Number(overview.focusScore || 0));

    return {
      focusScore,
      headMovementScore,
      facePresenceScore,
      framingScore,
      tensionScore,
      metrics: {
        sampledFrames: Number(overview.sampledFrames || 0),
        faceDetectedFrames: Number(overview.faceDetectedFrames || 0),
        averageFaceAreaRatio: Number(overview.averageFaceAreaRatio || 0),
        headMovementRaw: Number(overview.headMovementRaw || 0),
      },
      status: visionAnalysis?.status || 'unavailable',
      supportiveOverlayUsed: Boolean(visionAnalysis?.supportiveOverlayUsed),
    };
  }
}
