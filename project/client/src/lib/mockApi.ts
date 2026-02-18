import type { FeedbackReport, InterviewTurn, SessionConfig } from "./types";

export async function startSession(
  config: SessionConfig
): Promise<{ sessionId: string; previewQuestions: string[] }> {
  const previewQuestions =
    config.interviewType === "HR"
      ? [
          "Kendinizden bahseder misiniz? (1 dk yapılandırılmış)",
          "Bir çatışmayı nasıl çözdünüz? STAR ile anlatın.",
        ]
      : [
          "Idempotency nedir ve REST API’de neden önemlidir?",
          "Kubernetes’te bir Pod CrashLoopBackOff olursa nasıl debug edersiniz?",
        ];

  return {
    sessionId: `S-${Date.now()}`,
    previewQuestions,
  };
}

export async function getNextTurn(
  sessionId: string,
  _transcriptSoFar: string
): Promise<InterviewTurn> {
  return {
    id: `${sessionId}-Q${Math.floor(Math.random() * 99)}`,
    questionText: "Bir zorlukla karşılaştığınızda nasıl yaklaşırsınız? Örnekle anlatın.",
  };
}

export async function endSession(sessionId: string): Promise<FeedbackReport> {
  return {
    sessionId,
    overallScore: 82,
    content: [
      { key: "relevance", label: "İlgililik", score: 80, detail: "Cevap çoğunlukla soru odağında." },
      { key: "clarity", label: "Netlik", score: 78, detail: "Özet + örnek daha keskin olabilir." },
      { key: "completeness", label: "Kapsam", score: 75, detail: "Bir adım daha derinleşebilirsin." },
    ],
    communication: [
      { key: "fillers", label: "Dolgu kelimeler", score: 66, detail: "Geçişlerde arttı." },
      { key: "pauses", label: "Duraksamalar", score: 72, detail: "Zor kısımda normal." },
      { key: "pacing", label: "Tempo", score: 70, detail: "Ana noktaları vurgularken yavaşlat." },
    ],
    behavioral: [
      { key: "focus", label: "Odak (proxy)", score: 64, detail: "Yüz görünürlüğü dalgalı." },
      { key: "head", label: "Baş hareketi", score: 68, detail: "Bazı anlarda fazla hareket." },
    ],
    recommendations: [
      { title: "STAR yapısı", text: "Durum–Görev–Aksiyon–Sonuç formatını kullan." },
      { title: "Geçişlerde dur", text: "1–2 sn duraklayıp cümleyi planla." },
      { title: "Tek cümle özet", text: "Başta ana mesajı söyle, sonra örneğe gir." },
    ],
    notes: ["Not: Davranış sinyalleri koçluk amaçlıdır."],
  };
}
