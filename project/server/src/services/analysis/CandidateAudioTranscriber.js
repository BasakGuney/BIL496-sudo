export class CandidateAudioTranscriber {
  constructor({ apiKey = "", fetchImpl = fetch } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  extensionFromMimeType(mimeType = "") {
    const clean = String(mimeType || "").toLowerCase();
    if (clean.includes("ogg")) return "ogg";
    if (clean.includes("mpeg") || clean.includes("mp3")) return "mp3";
    if (clean.includes("wav")) return "wav";
    if (clean.includes("mp4") || clean.includes("m4a")) return "m4a";
    return "webm";
  }

  normalize(candidateAnswerAudios = []) {
    return (Array.isArray(candidateAnswerAudios) ? candidateAnswerAudios : [])
      .map((item) => ({
        mimeType: String(item?.mimeType || "audio/webm"),
        startedAt: Number(item?.startedAt || Date.now()),
        endedAt: Number(item?.endedAt || Date.now()),
        audioBase64: String(item?.audioBase64 || ""),
      }))
      .filter((item) => item.audioBase64.length > 0)
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  async transcribeOne({ audioBase64, mimeType }) {
    if (!this.apiKey || !audioBase64) return "";

    const ext = this.extensionFromMimeType(mimeType);
    const bytes = Buffer.from(audioBase64, "base64");
    if (bytes.length === 0) return "";

    const primaryText = await this.transcribeWithModel({
      bytes,
      ext,
      mimeType,
      model: "gpt-4o-transcribe",
    });
    if (!primaryText) return "";

    const primaryWordCount = primaryText.split(/\s+/).filter(Boolean).length;
    const primaryFillerCount = this.countFillers(primaryText);
    const shouldRetryWithFallback = primaryWordCount >= 8 && primaryFillerCount === 0;
    if (!shouldRetryWithFallback) return primaryText;

    // Bazı STT çıktıları dolgu seslerini normalize edebiliyor.
    // Bu durumda ikinci bir modelle (whisper-1) dener ve daha "ham" görünen metni seçeriz.
    const fallbackText = await this.transcribeWithModel({
      bytes,
      ext,
      mimeType,
      model: "whisper-1",
    });
    if (!fallbackText) return primaryText;

    const fallbackScore = this.scoreTranscriptForVerbatimness(fallbackText);
    const primaryScore = this.scoreTranscriptForVerbatimness(primaryText);
    return fallbackScore > primaryScore ? fallbackText : primaryText;
  }

  async transcribeWithModel({ bytes, ext, mimeType, model }) {
    const file = new File([bytes], `candidate.${ext}`, { type: mimeType || "audio/webm" });
    const formData = new FormData();
    formData.set("file", file);
    formData.set("model", model);
    formData.set("language", "tr");
    formData.set(
      "prompt",
      "Dökümü mümkün olduğunca söylenene sadık (verbatim) yaz. Dolgu ifadeleri (ıı, ııı, aa, aaa, eee, şey, hımm) silme; duyulduğu gibi koru. Türkçe cümle içindeki teknik İngilizce terimleri orijinal yazımıyla koru: Jenkins, Kubernetes, Docker, GitHub, CI/CD."
    );

    const response = await this.fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) return "";
    const payload = await response.json().catch(() => null);
    return String(payload?.text || "").trim();
  }

  countFillers(text = "") {
    const tokens = String(text || "")
      .toLocaleLowerCase("tr-TR")
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
      .filter(Boolean);
    const fillerRegex = /^(?:[ıi]{2,}|[ae]{2,}|h+[ıi]?m+|ş+e+y+|y+a+n+i+|b+i+l+m+i+y+o+r+u+m+|h+a+n+i+|i+ş+t+e+)$/u;
    return tokens.reduce((sum, token) => {
      const compact = token.replace(/(.)\1{2,}/gu, "$1$1");
      return sum + (fillerRegex.test(compact) ? 1 : 0);
    }, 0);
  }

  scoreTranscriptForVerbatimness(text = "") {
    const words = String(text || "").split(/\s+/).filter(Boolean).length;
    const fillers = this.countFillers(text);
    // Dolgu yakalama + yeterli uzunluk = daha "ham" transcript olasılığı yüksek.
    return fillers * 100 + words;
  }

  async transcribeCandidateAnswerAudios(candidateAnswerAudios = []) {
    const normalized = this.normalize(candidateAnswerAudios);
    const out = [];

    for (const item of normalized) {
      const text = await this.transcribeOne(item).catch(() => "");
      if (!text) continue;
      out.push({
        role: "candidate",
        text,
        ts: item.startedAt || Date.now(),
      });
    }

    return out;
  }
}
