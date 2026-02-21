export class TurnDetectionPolicy {
  serverVad() {
    return {
      type: "server_vad",
      create_response: true,
      prefix_padding_ms: 300,
      silence_duration_ms: 700,
    };
  }
}
