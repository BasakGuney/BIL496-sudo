import type { FeedbackReport, InterviewTurn, SessionConfig } from "./types";

const BACKEND_URL = "http://localhost:3001";

type TranscriptEntry = { role: "interviewer" | "candidate"; text: string; ts: number };
type DialogueReport = { sessionId: string; createdAt: string; dialogue: TranscriptEntry[] };

function toFeedbackReportFromDialogue(dialogueReport: DialogueReport): FeedbackReport {
  const dialogue = Array.isArray(dialogueReport.dialogue) ? dialogueReport.dialogue : [];
  const candidateTurns = dialogue.filter((d) => d.role === "candidate");
  const interviewerTurns = dialogue.filter((d) => d.role === "interviewer");

  const hasEnough = candidateTurns.length > 0 && interviewerTurns.length > 0;
  const base = hasEnough ? 72 : 58;

  return {
    sessionId: dialogueReport.sessionId,
    overallScore: base,
    content: [
      {
        key: "relevance",
        label: "İlgililik",
        score: base,
        detail: `${candidateTurns.length} aday yanıtı ve ${interviewerTurns.length} mülakatçı kaydı transcript'e işlendi.`,
      },
    ],
    communication: [
      {
        key: "pacing",
        label: "Tempo",
        score: Math.max(50, base - 4),
        detail: "Detaylı skor yerine transcript kayıtlarının varlığına göre özet metrik gösteriliyor.",
      },
    ],
    recommendations: [
      {
        title: "Transcript incele",
        text: "Bu rapor değerlendirme değil, yalnızca diyalog kayıt özetidir. Arşivdeki transcript dosyasını inceleyin.",
      },
    ],
    notes: dialogue.map((d) => `${d.role === "interviewer" ? "Interviewer" : "Aday"}: ${d.text}`),
  };
}

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

export async function endSession(
  sessionId: string,
  transcript: TranscriptEntry[]
): Promise<FeedbackReport> {
  try {
    const response = await fetch(`${BACKEND_URL}/session/${encodeURIComponent(sessionId)}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: Array.isArray(transcript) ? transcript : [] }),
    });

    if (response.ok) {
      const report = (await response.json()) as Partial<FeedbackReport> & Partial<DialogueReport>;
      if (Array.isArray((report as DialogueReport).dialogue)) {
        return toFeedbackReportFromDialogue(report as DialogueReport);
      }
      if (typeof report.overallScore === "number") {
        return report as FeedbackReport;
      }
    }
  } catch (error) {
    console.error("[endSession] backend report failed", error);
  }

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
