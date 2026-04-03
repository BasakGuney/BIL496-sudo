export class TranscriptSignalProcessor {
  countFillers(text = "") {
    const tokens = String(text || "")
      .toLocaleLowerCase("tr-TR")
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
      .filter(Boolean);

    const fillerTokenRegex = /^(?:[ıi]{2,}|[ae]{2,}|h+[ıi]?m+|ş+e+y+|y+a+n+i+|b+i+l+m+i+y+o+r+u+m+|h+a+n+i+|i+ş+t+e+)$/u;
    return tokens.reduce((sum, token) => {
      const compact = token.replace(/(.)\1{2,}/gu, "$1$1");
      return sum + (fillerTokenRegex.test(compact) ? 1 : 0);
    }, 0);
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
