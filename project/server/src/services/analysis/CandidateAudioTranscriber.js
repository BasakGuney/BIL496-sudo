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

    const file = new File([bytes], `candidate.${ext}`, { type: mimeType || "audio/webm" });
    const formData = new FormData();
    formData.set("file", file);
    formData.set("model", "gpt-4o-transcribe");
    formData.set("language", "tr");
    formData.set(
      "prompt",
      "Türkçe cümle içindeki teknik İngilizce terimleri orijinal yazımıyla koru: Jenkins, Kubernetes, Docker, GitHub, CI/CD."
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
    const text = String(payload?.text || "").trim();
    return text;
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
