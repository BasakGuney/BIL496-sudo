export class TranscriptSignalProcessor {
  fromTranscript(transcript) {
    const text = transcript.map((item) => String(item?.text || "")).join(" ");
    const fillerCount = (
      text.match(/\b(ı+|ee+|aa+|aaa+|eee+|şey|yani|hımm|hmm|bilmiyorum)\b/gi) || []
    ).length;
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      fillerRatio: words ? fillerCount / words : 0,
      pauseScore: 70,
      pacingScore: 70,
    };
  }
}
