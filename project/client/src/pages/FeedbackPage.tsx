import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FeedbackMetric, FeedbackReport } from "@/lib/types";
import { FeedbackSummary } from "@/components/feedback/FeedbackSummary";
import { ScoreBreakdown } from "@/components/feedback/ScoreBreakdown";
import { RecommendationList } from "@/components/feedback/RecommendationList";
import { getReport } from "@/lib/api";
import { RotateCcw } from "lucide-react";

function metricTone(score: number) {
  if (score >= 75) return "default" as const;
  if (score >= 50) return "secondary" as const;
  return "destructive" as const;
}

function AudioVisionScoreCards({ report }: { report: FeedbackReport }) {
  const audioClarity = Number(report.audioAnalysis?.model?.overall_clarity || 0);
  const vision = report.visionAnalysis;

  const cards = [
    {
      key: "overall",
      title: "Genel Başarı",
      score: Number(report.overallScore || 0),
      detail: "Genel skor tüm değerlendirme katmanlarının birleşik sonucudur.",
    },
    {
      key: "audio",
      title: "Ses Netliği",
      score: audioClarity,
      detail: "0-100 ölçeğinde hesaplanır; yüksek değer daha anlaşılır ses anlamına gelir.",
    },
    {
      key: "vision",
      title: "Görüntü Odağı",
      score: Number(vision?.overview?.focusScore || 0),
      detail: "Yüz görünürlüğü ve kadraj merkezliliğine göre 0-100 arasında hesaplanır.",
    },
    {
      key: "tension",
      title: "Görsel Gerginlik",
      score: Number(vision?.tension?.visualTensionScore || 0),
      detail: "Risk metriğidir; 0 düşük risk, 100 yüksek risk anlamına gelir.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key} className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{card.title}</CardTitle>
              <Badge variant={metricTone(card.score)} className="rounded-full">{card.score}/100</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={card.score} />
            <p className="text-sm text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LlmAnalysisPanel({ title, status, body, items }: { title: string; status?: string; body?: string; items?: string[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Badge variant={status === "ready" ? "default" : "outline"} className="rounded-full">
          {status === "ready" ? "Hazır" : "Bekleniyor"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {body ? <div className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{body}</div> : <p className="text-sm text-muted-foreground">Analiz çıktısı bekleniyor. Bu kutu arka plandaki Python/Ollama çıktıları geldikçe güncellenir.</p>}
        {items?.length ? (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {items.map((item, index) => <li key={index}>• {item}</li>)}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}


function AudioHighlights({ report }: { report: FeedbackReport }) {
  const audio = report.audioAnalysis?.model;
  if (!audio) return null;

  const emotionItems = Object.entries(audio.overall_emotions || {});

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Audio Skorları ve Duygu Özeti</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Ses Netliği</span>
            <Badge variant={metricTone(Number(audio.overall_clarity || 0))} className="rounded-full">{Number(audio.overall_clarity || 0)}/100</Badge>
          </div>
          <Progress value={Number(audio.overall_clarity || 0)} />
          <p className="text-sm text-muted-foreground">Bu skor 0-100 ölçeğindedir; yüksek değer daha temiz ve anlaşılır ses anlamına gelir.</p>
        </div>
        {emotionItems.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {emotionItems.map(([key, value]) => (
              <div key={key} className="rounded-2xl border p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium uppercase">{key}</span>
                  <Badge variant="outline" className="rounded-full">%{Number(value)}</Badge>
                </div>
                <Progress value={Number(value)} />
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function VisionHighlights({ report }: { report: FeedbackReport }) {
  const vision = report.visionAnalysis;
  const visionLlm = report.visionLlmAnalysis?.report;
  if (!vision) return null;

  const visionMetrics: FeedbackMetric[] = [
    { key: "facePresence", label: "Yüz görünürlüğü", score: Number(vision.overview.facePresenceScore || 0), detail: `Örneklenen ${vision.overview.sampledFrames} frame içinde ${vision.overview.faceDetectedFrames} frame'de yüz bulundu.` },
    { key: "centering", label: "Kadraj", score: Number(vision.overview.centeringScore || 0), detail: "0-100 ölçeğinde; yüksek değer yüzün merkeze daha yakın olduğunu gösterir." },
    { key: "steadiness", label: "Stabilite", score: Number(vision.overview.steadinessScore || 0), detail: "0-100 ölçeğinde; yüksek değer daha stabil duruşu gösterir." },
    { key: "stress", label: "Görsel gerginlik", score: Number(vision.tension.visualTensionScore || 0), detail: "Risk metriğidir; yüksek değer daha fazla gerginlik/risk sinyali anlamına gelir." },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Vision Skorları ve Sample Özeti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {visionMetrics.map((metric) => (
              <div key={metric.key} className="rounded-2xl border p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{metric.label}</span>
                  <Badge variant={metricTone(metric.score)} className="rounded-full">{metric.score}/100</Badge>
                </div>
                <Progress value={metric.score} />
                <p className="text-sm text-muted-foreground">{metric.detail}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border p-4 text-sm text-muted-foreground space-y-1">
            <p>• Kaydedilen sample sayısı: {vision.overview.savedSampleCount}</p>
            <p>• Sample seçimi artık sabit 3 kare değildir; önemli anlar (warn/danger, düşük göz görünürlüğü, belirgin kadraj değişimi) öncelikli saklanır.</p>
            <p>• Kaynak: {vision.source}</p>
            <p>• Durum: {vision.status}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Vision LLM Analizi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{visionLlm?.summary || "Vision LLM analizi henüz hazır değil."}</p>
          {Array.isArray(visionLlm?.scores) && visionLlm!.scores!.length > 0 ? (
            <div className="space-y-3">
              {visionLlm!.scores!.map((metric) => (
                <div key={metric.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{metric.label}</span>
                    <span className="text-muted-foreground">{metric.score}/100</span>
                  </div>
                  <Progress value={metric.score} />
                  {metric.detail ? <div className="text-sm text-muted-foreground">{metric.detail}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
          {visionLlm?.strengths?.length ? <div><p className="text-sm font-medium">Güçlü yanlar</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{visionLlm.strengths.map((item, index) => <li key={index}>• {item}</li>)}</ul></div> : null}
          {visionLlm?.risks?.length ? <div><p className="text-sm font-medium">Riskler</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{visionLlm.risks.map((item, index) => <li key={index}>• {item}</li>)}</ul></div> : null}
        </CardContent>
      </Card>
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

    const refresh = async () => {
      try {
        const latest = await getReport(sessionId);
        if (!cancelled) {
          setReport(latest);
          setRefreshError("");
        }
        const done = Boolean(
          latest.analysisStatus?.audio
          && latest.analysisStatus?.audioLlm
          && latest.analysisStatus?.transcript
          && (!latest.analysisStatus?.vision || latest.analysisStatus?.visionLlm)
        );
        attempts += 1;
        if (!cancelled && !done && attempts < 20) {
          window.setTimeout(refresh, 2500);
        }
      } catch (error: any) {
        if (!cancelled) {
          setRefreshError(error?.message || "Feedback yenilenemedi.");
        }
      }
    };

    refresh();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const transcriptRecommendationTitles = useMemo(() => {
    return Array.isArray(report.transcriptAnalysis?.recommendations)
      ? report.transcriptAnalysis!.recommendations!.map((item) => `${item.title}: ${item.text}`)
      : [];
  }, [report.transcriptAnalysis]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Geri Bildirim Raporu</div>
          <div className="text-sm text-muted-foreground">Oturum: {report.sessionId}</div>
        </div>
        <Button className="rounded-xl" onClick={onNew}>
          <RotateCcw className="mr-2 h-4 w-4" /> Yeni mülakat başlat
        </Button>
      </div>

      {refreshError ? <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{refreshError}</div> : null}

      <AudioVisionScoreCards report={report} />

      <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <FeedbackSummary report={report} />
        <RecommendationList report={report} />
      </div>

      <ScoreBreakdown report={report} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AudioHighlights report={report} />
        <VisionHighlights report={report} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <LlmAnalysisPanel
          title="Audio LLM Analizi"
          status={report.analysisStatus?.audioLlm ? "ready" : "pending"}
          body={report.audioAnalysis?.llmReport}
        />
        <LlmAnalysisPanel
          title="Transcript LLM Analizi"
          status={report.analysisStatus?.transcript ? "ready" : "pending"}
          body={report.transcriptAnalysis?.content?.map((item) => `${item.label}: ${item.score}/100 — ${item.detail || ""}`).join("\n")}
          items={transcriptRecommendationTitles}
        />
        <LlmAnalysisPanel
          title="Vision LLM Analizi"
          status={report.analysisStatus?.visionLlm ? "ready" : "pending"}
          body={report.visionLlmAnalysis?.report?.summary}
          items={report.visionLlmAnalysis?.report?.recommendations?.map((item) => `${item.title}: ${item.text}`)}
        />
      </div>
    </div>
  );
}
