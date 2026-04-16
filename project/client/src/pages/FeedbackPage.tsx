import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { FeedbackReport } from "@/lib/types";
import { getReport } from "@/lib/api";
import { TranscriptAnalysisTab } from "@/components/feedback/TranscriptAnalysisTab";
import { ScoreHero } from "@/components/feedback/ScoreHero";
import { BarChart3, Headphones, Eye, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const POLL_INTERVAL_MS = 2500;
const MISSING_REPORT_POLL_INTERVAL_MS = 1500;
const MAX_ANALYSIS_WAIT_MS = 300_000; // Increased to 5 minutes to ensure long vision analysis completes

function normalizeMetricLabel(label: string) {
  return String(label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .trim();
}

function computeOverallAudioPerformance(scores: Array<{ label: string; score: number }> = []) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  const weightedKeywords = [
    { keywords: ["netlik", "clarity"], weight: 0.35 },
    { keywords: ["hiz", "speed", "pacing"], weight: 0.25 },
    { keywords: ["akicilik", "fluency"], weight: 0.2 },
    { keywords: ["duygusal", "emotion", "denge", "ton"], weight: 0.2 },
  ];
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const item of scores) {
    const numericScore = Number(item?.score);
    if (!Number.isFinite(numericScore)) continue;
    const normalizedLabel = normalizeMetricLabel(item?.label || "");
    const matched = weightedKeywords.find(({ keywords }) => keywords.some((keyword) => normalizedLabel.includes(keyword)));
    if (!matched) continue;
    weightedTotal += numericScore * matched.weight;
    weightTotal += matched.weight;
  }
  if (weightTotal > 0) return Math.round(weightedTotal / weightTotal);
  const validScores = scores.map((item) => Number(item?.score)).filter((value) => Number.isFinite(value));
  if (validScores.length === 0) return 0;
  return Math.round(validScores.reduce((sum, value) => sum + value, 0) / validScores.length);
}

function normalizeRecommendationItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/g)
      .map((v) => v.replace(/^[\s•\-\u2022]+/, "").trim())
      .filter(Boolean);
  }
  return [];
}


function PendingAnalysisState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-16 h-16 rounded-3xl bg-enterprise-surface border border-enterprise-border flex items-center justify-center mb-6 animate-pulse">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-enterprise-text-2 max-w-xs mx-auto">{description}</p>
    </div>
  );
}



function AudioAnalysisTab({ report }: { report: FeedbackReport }) {
  const llm = report.audioLlmReport;
  if (!llm) {
    return (
      <PendingAnalysisState
        icon={<Headphones className="w-8 h-8 text-enterprise-accent opacity-50" />}
        title="Ses Analizi Bekleniyor"
        description="Ses verileri işlendiğinde bu alanda detaylı değerlendirme görünecek."
      />
    );
  }

  const scores = llm.scores ?? [];
  const overallAudioPerformance = computeOverallAudioPerformance(scores);
  const toneDistribution = Array.isArray(llm.tonDistribution) ? llm.tonDistribution : [];
  const speechSummary = Array.isArray(llm.speechSummary) ? llm.speechSummary : [];
  const nextInterviewItems = normalizeRecommendationItems(llm.recommendations?.nextInterview);
  const developmentItems = normalizeRecommendationItems(llm.recommendations?.performanceDevelopment);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <ScoreHero score={overallAudioPerformance} />

        <div className="card-style bg-enterprise-surface p-6">
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <div className="rounded-xl border border-enterprise-border bg-enterprise-surface-2 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-enterprise-text-3 mb-1">Baskın Duygusal Eğilim</p>
              <p className="text-sm font-semibold text-white">{llm.dominantEmotion || "Belirlenemedi"}</p>
            </div>
            <div className="rounded-xl border border-enterprise-border bg-enterprise-surface-2 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-enterprise-text-3 mb-1">İkinci Eğilim</p>
              <p className="text-sm font-semibold text-white">{llm.secondaryEmotion || "Belirlenemedi"}</p>
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2">Genel Değerlendirme</p>
          <p className="text-sm text-enterprise-text-2 leading-relaxed">{llm.overallAnalysis || "Ses değerlendirme özeti henüz üretilmedi."}</p>
          {speechSummary.length > 0 && (
            <div className="mt-4 space-y-2">
              {speechSummary.slice(0, 4).map((item, i) => (
                <div key={i} className="text-xs text-enterprise-text-2">• {item}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-style bg-enterprise-surface p-6">
        <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-3">Genel Ton Dağılımı</p>
        {toneDistribution.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {toneDistribution.map((tone, i) => (
              <div key={i} className="rounded-xl border border-enterprise-border bg-enterprise-surface-2 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white font-medium">{tone.label}</span>
                  <span className="text-xs text-enterprise-accent-2 font-bold">{tone.score}</span>
                </div>
                <div className="h-1.5 rounded-full bg-enterprise-surface overflow-hidden">
                  <div className="h-full bg-enterprise-accent" style={{ width: `${Math.max(0, Math.min(100, Number(tone.score || 0)))}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-enterprise-text-3">Ton dağılımı verisi bulunamadı.</p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {scores.map((s, i) => (
          <div key={i} className="card-style bg-enterprise-surface p-5">
            <div className="text-[11px] text-enterprise-text-3 mb-2">{s.label}</div>
            <div className="text-3xl font-black text-white mb-2">{s.score}</div>
            <p className="text-xs text-enterprise-text-2">{s.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-style bg-enterprise-surface p-5">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-3">Bir Sonraki Mülakatta</p>
          {nextInterviewItems.length > 0 ? nextInterviewItems.map((item, i) => (
            <div key={i} className="text-sm text-enterprise-text-2 mb-2">• {item}</div>
          )) : <p className="text-sm text-enterprise-text-3">Öneri bulunamadı.</p>}
        </div>
        <div className="card-style bg-enterprise-surface p-5">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-3">Performans Geliştirme</p>
          {developmentItems.length > 0 ? developmentItems.map((item, i) => (
            <div key={i} className="text-sm text-enterprise-text-2 mb-2">• {item}</div>
          )) : <p className="text-sm text-enterprise-text-3">Gelişim önerisi bulunamadı.</p>}
        </div>
      </div>
    </div>
  );
}

function VisionAnalysisTab({ report }: { report: FeedbackReport }) {
  const visionReport = report.visionLlmAnalysis?.report;
  if (!visionReport) {
    return (
      <PendingAnalysisState
        icon={<Eye className="w-8 h-8 text-enterprise-accent opacity-50" />}
        title="Görüntü Analizi Bekleniyor"
        description="Kamera verisi işlendiğinde görsel analiz burada listelenecek."
      />
    );
  }

  const strengths = Array.isArray(visionReport.strengths) ? visionReport.strengths : [];
  const improvements = Array.isArray(visionReport.improvementAreas) ? visionReport.improvementAreas : [];
  const visionNextItems = normalizeRecommendationItems(visionReport.recommendations?.nextInterview);
  const visionDevItems = normalizeRecommendationItems(visionReport.recommendations?.performanceDevelopment);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <ScoreHero score={Number(visionReport.overallScore || 0)} />

        <div className="card-style bg-enterprise-surface p-6">
          <div className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-4">Genel Değerlendirme</div>
          <p className="text-sm text-enterprise-text-2 leading-relaxed">{visionReport.overallAnalysis || "Analiz metni bulunamadı."}</p>
          <div className="mt-4 rounded-xl border border-enterprise-border bg-enterprise-surface-2 p-3">
            <p className="text-[10px] uppercase tracking-wider text-enterprise-text-3 mb-1">Risk Değerlendirmesi</p>
            <p className="text-sm text-white">{visionReport.riskPoint || "Belirgin bir risk notu bulunmuyor."}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {(visionReport.scores || []).map((s, i) => (
          <div key={i} className="card-style bg-enterprise-surface p-5">
            <div className="text-[11px] text-enterprise-text-3 mb-2">{s.label}</div>
            <div className="text-3xl font-black text-white mb-2">{s.score}</div>
            <p className="text-xs text-enterprise-text-2">{s.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-style bg-enterprise-surface p-5">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-3">Güçlü Yönler</p>
          {strengths.length > 0 ? strengths.map((item, i) => (
            <div key={i} className="text-sm text-enterprise-text-2 mb-2">• {item}</div>
          )) : <p className="text-sm text-enterprise-text-3">Güçlü yön verisi bulunamadı.</p>}
        </div>
        <div className="card-style bg-enterprise-surface p-5">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-3">Gelişim Alanları</p>
          {improvements.length > 0 ? improvements.map((item, i) => (
            <div key={i} className="text-sm text-enterprise-text-2 mb-2">• {item}</div>
          )) : <p className="text-sm text-enterprise-text-3">Gelişim alanı verisi bulunamadı.</p>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-style bg-enterprise-surface p-5">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-3">Bir Sonraki Mülakatta</p>
          {visionNextItems.length > 0 ? visionNextItems.map((item, i) => (
            <div key={i} className="text-sm text-enterprise-text-2 mb-2">• {item}</div>
          )) : <p className="text-sm text-enterprise-text-3">Öneri bulunamadı.</p>}
        </div>
        <div className="card-style bg-enterprise-surface p-5">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-3">Performans Geliştirme</p>
          {visionDevItems.length > 0 ? visionDevItems.map((item, i) => (
            <div key={i} className="text-sm text-enterprise-text-2 mb-2">• {item}</div>
          )) : <p className="text-sm text-enterprise-text-3">Gelişim önerisi bulunamadı.</p>}
        </div>
      </div>
    </div>
  );
}

export function FeedbackPage({
  initialReport,
  sessionId,
  expectVision,
}: {
  initialReport: FeedbackReport;
  sessionId: string;
  expectVision?: boolean;
}) {
  const [report, setReport] = useState<FeedbackReport>(initialReport);
  const [refreshError, setRefreshError] = useState("");
  const transcriptOverall = (report.transcriptAnalysis as any)?.overall;

  useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let retryTimer: number | null = null;

    const refresh = async () => {
      try {
        const latest = await getReport(sessionId);
        if (!cancelled) {
          setReport(latest);
          setRefreshError("");
        }
        const transcriptArtifactReady = Boolean((latest.transcriptAnalysis as any)?.overall || latest.analysisStatus?.transcript);
        const audioArtifactReady = Boolean(latest.audioLlmReport || latest.analysisStatus?.audioLlm);
        const visionArtifactReady = Boolean(latest.visionLlmAnalysis?.report || latest.analysisStatus?.visionLlm);
        const shouldExpectVision = Boolean(
          expectVision ||
          initialReport?.visionAnalysis ||
          initialReport?.visionLlmAnalysis ||
          initialReport?.analysisStatus?.vision ||
          initialReport?.analysisStatus?.visionLlm ||
          latest.visionAnalysis ||
          latest.visionLlmAnalysis ||
          latest.analysisStatus?.vision ||
          latest.analysisStatus?.visionLlm
        );
        const done = Boolean(
          transcriptArtifactReady &&
          audioArtifactReady &&
          (!shouldExpectVision || visionArtifactReady)
        );
        attempts += 1;
        if (!cancelled && !done && attempts < Math.ceil(MAX_ANALYSIS_WAIT_MS / POLL_INTERVAL_MS)) {
          retryTimer = window.setTimeout(refresh, POLL_INTERVAL_MS);
        }
      } catch (error: any) {
        attempts += 1;
        if (!cancelled && attempts < Math.ceil(MAX_ANALYSIS_WAIT_MS / MISSING_REPORT_POLL_INTERVAL_MS)) {
          retryTimer = window.setTimeout(refresh, MISSING_REPORT_POLL_INTERVAL_MS);
          return;
        }
        if (!cancelled) setRefreshError(error?.message || "Rapor alınırken bir hata oluştu.");
      }
    };

    refresh();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [expectVision, initialReport, sessionId]);

  const transcriptReady = Boolean(transcriptOverall || report.analysisStatus?.transcript);
  const audioReady = Boolean(report.audioLlmReport || report.analysisStatus?.audioLlm);
  const visionReady = Boolean(report.visionLlmAnalysis?.report || report.analysisStatus?.visionLlm);

  return (
    <div className="max-w-[1280px] mx-auto px-8 py-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Mülakat Raporu</h1>
          <p className="text-sm text-enterprise-text-3">Oturum: #{sessionId.slice(0, 8)}</p>
        </div>
      </header>

      <div className="card-style bg-enterprise-surface p-6 max-w-[520px]">
        <p className="text-[10px] font-bold text-enterprise-text-3 uppercase tracking-widest mb-3">Analiz Durumu</p>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between bg-enterprise-surface-2 border border-enterprise-border rounded-lg px-3 py-2">
            <span className="text-enterprise-text-2">Yanıt Analizi</span>
            <span className={transcriptReady ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
              {transcriptReady ? "Tamamlandı" : "Yanıt analizi bekleniyor"}
            </span>
          </div>
          <div className="flex items-center justify-between bg-enterprise-surface-2 border border-enterprise-border rounded-lg px-3 py-2">
            <span className="text-enterprise-text-2">Ses Analizi</span>
            <span className={audioReady ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
              {audioReady ? "Tamamlandı" : "Ses analizi bekleniyor"}
            </span>
          </div>
          <div className="flex items-center justify-between bg-enterprise-surface-2 border border-enterprise-border rounded-lg px-3 py-2">
            <span className="text-enterprise-text-2">Görüntü Analizi</span>
            <span className={visionReady ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
              {visionReady ? "Tamamlandı" : "Görüntü analizi bekleniyor"}
            </span>
          </div>
        </div>
      </div>

      {refreshError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 px-4 py-3 text-sm inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {refreshError}
        </div>
      )}

      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="bg-enterprise-surface p-1 rounded-xl border border-enterprise-border inline-flex h-auto mb-4">
          <TabsTrigger value="transcript" className="rounded-lg px-6 py-2 text-xs font-semibold data-[state=active]:bg-enterprise-surface-2">
            <BarChart3 className="w-3.5 h-3.5 mr-2" />
            Yanıt Analizi
          </TabsTrigger>
          <TabsTrigger value="audio" className="rounded-lg px-6 py-2 text-xs font-semibold data-[state=active]:bg-enterprise-surface-2">
            <Headphones className="w-3.5 h-3.5 mr-2" />
            Ses Analizi
          </TabsTrigger>
          <TabsTrigger value="vision" className="rounded-lg px-6 py-2 text-xs font-semibold data-[state=active]:bg-enterprise-surface-2">
            <Eye className="w-3.5 h-3.5 mr-2" />
            Görüntü Analizi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcript">
          <TranscriptAnalysisTab report={report} />
        </TabsContent>
        <TabsContent value="audio">
          <AudioAnalysisTab report={report} />
        </TabsContent>
        <TabsContent value="vision">
          <VisionAnalysisTab report={report} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
