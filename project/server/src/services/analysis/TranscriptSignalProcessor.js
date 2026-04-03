export class TranscriptSignalProcessor {
  countFillers(text = "") {
    const tokens = String(text || "")
      .toLocaleLowerCase("tr-TR")
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
      .filter(Boolean);

    const fillerTokenRegex = /^(?:ı{2,}|i{2,}|a{2,}|e{2,}|h+m+|h+ı+m+|h+i+m+|şey+|yani|bilmiyorum)$/u;
    return tokens.reduce((sum, token) => sum + (fillerTokenRegex.test(token) ? 1 : 0), 0);
  }

  fromTranscript(transcript) {
    const text = transcript.map((item) => String(item?.text || "")).join(" ");
    const fillerCount = this.countFillers(text);
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      fillerRatio: words ? fillerCount / words : 0,
      pauseScore: 70,
      pacingScore: 70,
    };
  }
}
