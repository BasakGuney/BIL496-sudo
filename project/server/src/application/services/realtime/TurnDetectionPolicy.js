export class TurnDetectionPolicy {
  buildServerVad() {
    return { type: "server_vad", threshold: 0.5, silence_duration_ms: 500 };
  }
}
