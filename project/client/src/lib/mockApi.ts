import type { FeedbackReport, InterviewTurn, SessionConfig } from "./types";

type MockSessionState = {
  id: string;
  config: SessionConfig;
  preparedQuestions: string[];
  turns: { question: string; answer: string }[];
};

const sessions = new Map<string, MockSessionState>();

function buildQuestionPlan(config: SessionConfig): string[] {
  const role = config.role || "Aday";
  const domain = config.domainInterest || "Genel";
  const context = config.companyOrIndustry || "Genel sektör";

  return [
    `${role} pozisyonu için bu role neden uygun olduğunuzu anlatır mısınız?`,
    `${domain} alanında çözdüğünüz gerçek bir problemi adım adım açıklar mısınız?`,
    `${context} bağlamında kritik bir incident yaşansa ilk 15 dakikada ne yaparsınız?`,
    `${role} olarak teknik borç ile teslim tarihi baskısı arasında nasıl denge kurarsınız?`,
    `Bir önceki anlattığınız örneği temel alarak iyileştirme planınızı metriklerle açıklar mısınız?`,
  ];
}

export async function startSession(
  config: SessionConfig
): Promise<{ sessionId: string; previewQuestions: string[] }> {
  const preparedQuestions = buildQuestionPlan(config);
  const sessionId = `S-${Date.now()}`;

  sessions.set(sessionId, {
    id: sessionId,
    config,
    preparedQuestions,
    turns: [],
  });

  return {
    sessionId,
    previewQuestions: preparedQuestions.slice(0, 2),
  };
}

export async function getNextTurn(
  sessionId: string,
  transcriptSoFar: string
): Promise<InterviewTurn> {
  const session = sessions.get(sessionId);
  if (!session) {
    return {
      id: `${sessionId}-Q0`,
      questionText: "Oturum bulunamadı. Lütfen yeniden başlatın.",
    };
  }

  const nextPrepared = session.preparedQuestions[session.turns.length];
  if (nextPrepared) {
    session.turns.push({ question: nextPrepared, answer: transcriptSoFar });
    return {
      id: `${sessionId}-Q${session.turns.length}`,
      questionText: nextPrepared,
    };
  }

  const memoryBasedFollowUp = transcriptSoFar
    ? `Az önce '${transcriptSoFar.slice(0, 80)}...' dediniz. Buna göre riskleri nasıl önceliklendirirsiniz?`
    : "Önceki yanıtlarınızı dikkate alarak bu yaklaşımı nasıl geliştirirsiniz?";

  session.turns.push({ question: memoryBasedFollowUp, answer: transcriptSoFar });

  return {
    id: `${sessionId}-Q${session.turns.length}`,
    questionText: memoryBasedFollowUp,
  };
}

export async function endSession(sessionId: string): Promise<FeedbackReport> {
  const session = sessions.get(sessionId);
  const turnCount = session?.turns.length ?? 0;

  return {
    sessionId,
    overallScore: 82,
    content: [
      { key: "relevance", label: "İlgililik", score: 80, detail: "Cevaplar seçilen pozisyon odağında kaldı." },
      { key: "clarity", label: "Netlik", score: 78, detail: "Özet + örnek ilişkisi genel olarak tutarlı." },
      { key: "completeness", label: "Kapsam", score: 75, detail: "Bazı yanıtlarda sonuç metriği eklenebilir." },
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
      { title: "Rol odaklı anlatım", text: `Seçtiğiniz role uygun örnekleri net KPI ile destekleyin.` },
      { title: "Yanıt sürekliliği", text: `Önceki cevaplara referans vererek tutarlılığı koruyun (${turnCount} tur işlendi).` },
      { title: "Tek cümle özet", text: "Başta ana mesajı söyle, sonra örneğe gir." },
    ],
    notes: ["Not: Davranış sinyalleri koçluk amaçlıdır."],
  };
}
