export class VisionSignalProcessor {
  clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(Number(value || 0))));
  }

  fromSession(_session, visionAnalysis = null) {
    const summary = visionAnalysis?.summary || {};
    const metrics = visionAnalysis?.metrics || {};

    const facePresenceScore = this.clamp((Number(summary.facePresenceRatio || 0) || 0) * 100);
    const framingScore = this.clamp(Number(summary.centeringScore || 0));
    const headMovementScore = this.clamp(Number(summary.steadinessScore || 0));
    const tensionScore = this.clamp(Number(summary.visualTensionScore || 0));
    const focusScore = this.clamp(
      summary.faceDetectedFrames > 0
        ? (facePresenceScore * 0.55) + (framingScore * 0.45)
        : 0
    );

    return {
      focusScore,
      headMovementScore,
      facePresenceScore,
      framingScore,
      tensionScore,
      metrics: {
        sampledFrames: Number(metrics.sampledFrames || 0),
        faceDetectedFrames: Number(metrics.faceDetectedFrames || 0),
        averageFaceAreaRatio: Number(summary.averageFaceAreaRatio || 0),
        headMovementRaw: Number(summary.headMovementRaw || 0),
      },
      notes: Array.isArray(visionAnalysis?.notes) ? visionAnalysis.notes : [],
      status: visionAnalysis?.status || 'unavailable',
      supportiveOverlayUsed: Boolean(visionAnalysis?.supportiveOverlayUsed),
    };
  }
}
