import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FeedbackReport } from "@/lib/types";
import { getReport } from "@/lib/api";
import { TranscriptAnalysisTab } from "@/components/feedback/TranscriptAnalysisTab";
import { RotateCcw, BarChart3, Headphones, Eye, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const POLL_INTERVAL_MS = 2500;
const MISSING_REPORT_POLL_INTERVAL_MS = 1500;
const MAX_ANALYSIS_WAIT_MS = 90_000;

function normalizeMetricLabel(label: string) {
  return String(label || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("ı", "i").trim();
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
  return (
    <div className="space-y-4">
      <div className="card-style bg-enterprise-surface p-6">
        <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2">Genel Ses Performansı</p>
        <p className="text-6xl font-black text-white">{overallAudioPerformance}</p>
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

  return (
    <div className="space-y-4">
      <div className="card-style bg-enterprise-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2">Görsel Profil Skoru</p>
            <p className="text-6xl font-black text-white">{visionReport.overallScore ?? 0}</p>
          </div>
          <Badge className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{visionReport.standardStatus || "Standart"}</Badge>
        </div>
        <p className="text-sm text-enterprise-text-2 mt-5">{visionReport.overallAnalysis || "Analiz metni bulunamadı."}</p>
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
    </div>
  );
}

export function FeedbackPage({ initialReport, sessionId, onNew }: { initialReport: FeedbackReport; sessionId: string; onNew: () => void }) {
  const [report, setReport] = useState<FeedbackReport>(initialReport);
  const [refreshError, setRefreshError] = useState("");

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
        const done = Boolean(
          latest.analysisStatus?.audio &&
          latest.analysisStatus?.audioLlm &&
          latest.analysisStatus?.transcript &&
          (!latest.analysisStatus?.vision || latest.analysisStatus?.visionLlm)
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
        if (!cancelled) {
          setRefreshError(error?.message || "Rapor alınırken bir hata oluştu.");
        }
      }
    };

    refresh();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [sessionId]);

  const transcriptReady = Boolean(report.analysisStatus?.transcript);
  const audioReady = Boolean(report.analysisStatus?.audioLlm);
  const visionReady = Boolean(report.analysisStatus?.visionLlm);

  return (
    <div className="max-w-[1280px] mx-auto px-8 py-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Mülakat Raporu</h1>
          <p className="text-sm text-enterprise-text-3">Oturum: #{sessionId.slice(0, 8)}</p>
        </div>
        <Button className="h-11 px-6 rounded-xl bg-gradient-to-r from-enterprise-accent to-enterprise-accent-2 text-white font-semibold" onClick={onNew}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Yeni Mülakat
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_1fr]">
        <div className="card-style bg-enterprise-surface p-6 flex flex-col items-center justify-center">
          <div className="text-5xl font-black text-white">{Number(report.overallScore || 0)}</div>
          <div className="text-xs text-enterprise-text-3 mt-1">/100</div>
          <Badge className="mt-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-wider">
            Genel Skor
          </Badge>
        </div>
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] font-bold text-enterprise-text-3 uppercase tracking-widest mb-3">Genel Değerlendirme</p>
          <p className="text-sm text-enterprise-text-2 leading-relaxed">{report.notes?.[0] || "Değerlendirme hazırlanıyor."}</p>
        </div>
        <div className="card-style bg-enterprise-surface p-6">
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
