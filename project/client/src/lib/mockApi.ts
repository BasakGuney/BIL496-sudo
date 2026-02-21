import type { FeedbackReport, InterviewTurn, SessionConfig } from "./types";

type MockSessionState = {
  id: string;
  config: SessionConfig;
  preparedQuestions: string[];
  turns: { question: string; answer: string; relevance: number }[];
};

const sessions = new Map<string, MockSessionState>();

function getHonorific(config: SessionConfig) {
  if (config.gender === "Female") return "Hanım";
  if (config.gender === "Male") return "Bey";
  return "";
}

function buildQuestionPlan(config: SessionConfig): string[] {
  const fullName = `${config.firstName} ${config.lastName}`.trim();
  const honorific = getHonorific(config);
  const candidate = `${fullName}${honorific ? ` ${honorific}` : ""}`.trim();

  const firstQuestion = `${candidate}, hazırsanız başlayalım. Kısaca kendinizden; eğitim hayatınız ve iş tecrübelerinizden bahseder misiniz?`;

  if (config.interviewType === "HR") {
    return [
      firstQuestion,
      "STAR formatında ekip içinde yaşadığınız bir çatışmayı nasıl çözdüğünüzü anlatır mısınız?",
      "Zor bir durumda inisiyatif aldığınız bir örneği STAR ile paylaşır mısınız?",
      "Geri bildirim aldığınız ve davranışınızı değiştirdiğiniz bir durumu STAR ile anlatır mısınız?",
      "Bu role özel olarak güçlü ve gelişime açık yönlerinizi örnekle açıklar mısınız?",
      "Son olarak, bu pozisyonda ilk 3 ay hedefinizi nasıl planlarsınız?",
    ];
  }

  return [
    firstQuestion,
    `${config.role} rolünde ${config.domainInterest} tarafında yaptığınız bir çalışmayı anlatır mısınız?`,
    `${config.companyOrIndustry} ortamında kritik bir teknik sorun çıktığında nasıl önceliklendirme yaparsınız?`,
    `${config.domainInterest} konusunda izlediğiniz ölçüm/izleme metriklerinden hangileri kararınızı etkiler?`,
    `${config.role} pozisyonunda üretime alma öncesi riskleri nasıl azaltırsınız?`,
    "Daha önce anlattığınız örneklerden birini iyileştirmek isteseniz neyi farklı yapardınız?",
  ];
}

function estimateRelevance(answer: string, config: SessionConfig) {
  const text = (answer || "").toLowerCase();
  const keywords = [config.role, config.domainInterest, config.companyOrIndustry, "star", "incident", "monitor", "ölçek"].map((x) => String(x).toLowerCase());
  const hits = keywords.filter((k) => k && text.includes(k)).length;
  return Math.min(100, 45 + hits * 10);
}

export async function startSession(config: SessionConfig): Promise<{ sessionId: string; previewQuestions: string[] }> {
  const preparedQuestions = buildQuestionPlan(config);
  const sessionId = `S-${Date.now()}`;

  sessions.set(sessionId, { id: sessionId, config, preparedQuestions, turns: [] });

  return { sessionId, previewQuestions: preparedQuestions.slice(0, 2) };
}

export async function getNextTurn(sessionId: string, transcriptSoFar: string): Promise<InterviewTurn> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { id: `${sessionId}-Q0`, questionText: "Oturum bulunamadı. Lütfen yeniden başlatın." };
  }

  const relevance = estimateRelevance(transcriptSoFar, session.config);
  const nextPrepared = session.preparedQuestions[session.turns.length];

  if (nextPrepared) {
    session.turns.push({ question: nextPrepared, answer: transcriptSoFar, relevance });
    return { id: `${sessionId}-Q${session.turns.length}`, questionText: nextPrepared };
  }

  const fallback = session.config.mode === "Supportive"
    ? "Takıldığınız noktada isterseniz küçük bir ipucu verebilirim; önce problemi, sonra aksiyonu anlatabilirsiniz. Devam edelim mi?"
    : "Anladım, bu kadarı yeterli. Devam sorusuna geçelim.";

  session.turns.push({ question: fallback, answer: transcriptSoFar, relevance });
  return { id: `${sessionId}-Q${session.turns.length}`, questionText: fallback };
}

export async function endSession(sessionId: string): Promise<FeedbackReport> {
  const session = sessions.get(sessionId);
  const turnCount = session?.turns.length ?? 0;
  const avgRel = session && turnCount ? Math.round(session.turns.reduce((a, t) => a + t.relevance, 0) / turnCount) : 70;

  return {
    sessionId,
    overallScore: Math.round((82 + avgRel) / 2),
    content: [
      { key: "relevance", label: "İlgililik", score: avgRel, detail: "Her cevap için uygunluk skoru hesaplandı." },
      { key: "clarity", label: "Netlik", score: 78, detail: "Özet + örnek ilişkisi genel olarak tutarlı." },
      { key: "completeness", label: "Kapsam", score: 75, detail: "Bazı yanıtlarda sonuç metriği eklenebilir." },
    ],
    communication: [
      { key: "fillers", label: "Dolgu kelimeler", score: 66, detail: "Geçişlerde arttı." },
      { key: "pauses", label: "Duraksamalar", score: 72, detail: "Zor kısımda normal." },
      { key: "pacing", label: "Tempo", score: 70, detail: "Cevap süresi uzadığında kısa toplama önerilir." },
    ],
    behavioral: [
      { key: "focus", label: "Odak (proxy)", score: 64, detail: "Yüz görünürlüğü dalgalı." },
      { key: "head", label: "Baş hareketi", score: 68, detail: "Bazı anlarda fazla hareket." },
    ],
    recommendations: [
      { title: "İlgililik", text: `Cevap ilgililik ortalaması: ${avgRel}. Soruya daha direkt girin.` },
      { title: "Süre yönetimi", text: `Uzayan yanıtlarda ana mesajı 20-30 sn içinde verin (${turnCount} tur işlendi).` },
      { title: "Yapı", text: "STAR veya Problem-Aksiyon-Sonuç çerçevesini koruyun." },
    ],
    notes: ["Not: Bu değerlendirmeler görüşme sırasında sesli paylaşılmaz, sadece rapora işlenir."],
  };
}
