import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FeedbackReport } from "@/lib/types";
import { getReport } from "@/lib/api";
import { TranscriptAnalysisTab } from "@/components/feedback/TranscriptAnalysisTab";
import { RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";





function AudioAnalysisTab({ report }: { report: FeedbackReport }) {
  const llm = report.audioLlmReport;
  
  if (!llm) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Ses analizi henüz hazır değil. Lütfen bekleyin...</p>
        </CardContent>
      </Card>
    );
  }

  const scores = llm.scores ?? [];
  const clarityScore = scores.find(s => s.label === "Ses Netliği")?.score ?? 0;

  return (
    <div className="space-y-6">
      {/* Hero row */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card className="rounded-2xl">
          <CardContent className="pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 min-h-[180px]">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Genel Ses Netliği</p>
              <p className="text-6xl font-extrabold leading-none mb-3">
                {clarityScore}
                <span className="text-2xl font-semibold">/100</span>
              </p>
              <Badge className="rounded-full bg-blue-50 text-blue-700 border-blue-200" variant="outline">
                {llm.clarityBadge ?? "Analiz Edilemedi"}
              </Badge>
            </div>
            
            <div className="grid gap-3 w-full md:w-[42%]">
              <div className="rounded-xl border bg-gray-50/50 p-3.5">
                <div className="text-[12px] uppercase text-muted-foreground tracking-wider mb-1.5">Baskın Duygusal Eğilim</div>
                <div className="text-sm font-semibold leading-snug">{llm.dominantEmotion ?? "—"}</div>
              </div>
              <div className="rounded-xl border bg-gray-50/50 p-3.5">
                <div className="text-[12px] uppercase text-muted-foreground tracking-wider mb-1.5">İkinci Eğilim</div>
                <div className="text-sm font-semibold leading-snug">{llm.secondaryEmotion ?? "Yok"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-[20px]">Genel Değerlendirme</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[15px] text-muted-foreground leading-[1.6]">
              {llm.overallAnalysis ?? "Ses analizi yorumu bekleniyor..."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dimension scores */}
      {scores.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {scores.map((s) => (
            <Card key={s.label} className="rounded-2xl">
              <CardContent className="pt-5 flex flex-col min-h-[180px]">
                <h4 className="font-semibold text-[15px] mb-2.5 min-h-[38px]">{s.label}</h4>
                <div className="text-[28px] font-extrabold mb-2.5">{s.score}</div>
                <div className="text-[13px] text-muted-foreground leading-[1.5] mb-3 flex-1 min-h-[42px]">
                  {s.detail}
                </div>
                <Progress value={s.score} className="h-[10px] mt-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Content Grid: Ton Dağılımı + Konuşma Özeti */}
      <div className="grid gap-4 md:grid-cols-2">
        {llm.tonDistribution && llm.tonDistribution.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-[20px]">Genel Ton Dağılımı</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2.5 pl-5 text-foreground list-disc marker:text-muted-foreground">
                {llm.tonDistribution.map((item, i) => (
                  <li key={i} className="leading-[1.6]">
                    <strong>{item.label}:</strong> %{item.score}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        
        {llm.speechSummary && llm.speechSummary.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-[20px]">Konuşma Özeti</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2.5 pl-5 text-foreground list-disc marker:text-muted-foreground">
                {llm.speechSummary.map((item, i) => (
                  <li key={i} className="leading-[1.6]">{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recommendations */}
      {llm.recommendations && (llm.recommendations.nextInterview || llm.recommendations.performanceDevelopment) && (
        <div className="grid gap-4 md:grid-cols-2">
          {llm.recommendations.nextInterview && (
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-base text-foreground">Bir Sonraki Mülakatta</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[15px] text-zinc-700 leading-[1.7]">
                  {llm.recommendations.nextInterview}
                </p>
              </CardContent>
            </Card>
          )}
          {llm.recommendations.performanceDevelopment && (
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-base text-foreground">Performans Geliştirme</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[15px] text-zinc-700 leading-[1.7]">
                  {llm.recommendations.performanceDevelopment}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}


function VisionAnalysisTab({ report }: { report: FeedbackReport }) {
  const r = report.visionLlmAnalysis?.report;

  if (!r) {
    const pending = !report.analysisStatus?.visionLlm;
    return (
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            {pending
              ? "Görüntü analizi arka planda hazırlanıyor. Lütfen bekleyin..."
              : "Görüntü analizi bu oturum için mevcut değil."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const overallScore    = Number(r.overallScore   ?? 0);
  const overallLabel    = r.overallLabel    ?? "";
  const overallAnalysis = r.overallAnalysis ?? "";
  const standardStatus  = r.standardStatus  ?? "";
  const riskPoint       = r.riskPoint       ?? "";
  const scores          = Array.isArray(r.scores)          ? r.scores          : [];
  const strengths       = Array.isArray(r.strengths)       ? r.strengths       : [];
  const improvementAreas= Array.isArray(r.improvementAreas)? r.improvementAreas: [];
  const recs            = r.recommendations ?? {};
  const nextInterview   = Array.isArray(recs.nextInterview)        ? recs.nextInterview        : [];
  const perfDev         = Array.isArray(recs.performanceDevelopment)? recs.performanceDevelopment: [];

  return (
    <div className="space-y-5">
      {/* ── Hero grid ───────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* Sol: Büyük skor + mini-box'lar */}
        <Card className="rounded-2xl">
          <CardContent className="pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 min-h-[180px]">
            <div>
              <p className="text-sm text-muted-foreground mb-2.5">Genel Görsel Puan</p>
              <p className="text-[64px] font-extrabold leading-none mb-3">
                {overallScore}
                <span className="text-2xl font-semibold">/100</span>
              </p>
              {overallLabel && (
                <span className="inline-block px-3 py-2 rounded-full text-[13px] font-bold border border-green-200 bg-green-50 text-green-700">
                  {overallLabel}
                </span>
              )}
            </div>

            <div className="grid gap-3 w-full md:w-[42%]">
              {standardStatus && (
                <div className="rounded-xl border bg-muted/40 p-3.5">
                  <div className="text-[12px] uppercase text-muted-foreground tracking-wider mb-1.5">
                    Standart Uygunluk
                  </div>
                  <div className="text-sm font-semibold leading-snug">{standardStatus}</div>
                </div>
              )}
              {riskPoint && (
                <div className="rounded-xl border bg-muted/40 p-3.5">
                  <div className="text-[12px] uppercase text-muted-foreground tracking-wider mb-1.5">
                    Risk Noktası
                  </div>
                  <div className="text-sm font-semibold leading-snug">{riskPoint}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sağ: Genel Değerlendirme */}
        {overallAnalysis && (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-[20px]">Genel Değerlendirme</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[15px] text-muted-foreground leading-[1.75]">
                {overallAnalysis}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── 4 boyut kartı ───────────────────────────────────────── */}
      {scores.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {scores.map((s) => (
            <Card key={s.key} className="rounded-2xl">
              <CardContent className="pt-5 flex flex-col min-h-[180px]">
                <h4 className="font-semibold text-[15px] mb-2.5 min-h-[38px]">{s.label}</h4>
                <div className="text-[28px] font-extrabold mb-2.5">{s.score}</div>
                <div className="text-[13px] text-muted-foreground leading-[1.5] mb-3 flex-1 min-h-[42px]">
                  {s.detail}
                </div>
                <Progress value={s.score} className="h-[10px] mt-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Standartta Olan / Riskler ────────────────────────────── */}
      {(strengths.length > 0 || improvementAreas.length > 0) && (
        <div className="grid gap-5 md:grid-cols-2">
          {strengths.length > 0 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-[20px]">Standartta Olan Noktalar</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 pl-5 list-disc marker:text-muted-foreground">
                  {strengths.map((item, i) => (
                    <li key={i} className="text-sm leading-[1.6]">{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {improvementAreas.length > 0 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-[20px]">Riskler</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 pl-5 list-disc marker:text-muted-foreground">
                  {improvementAreas.map((item, i) => (
                    <li key={i} className="text-sm leading-[1.6]">{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Öneriler ────────────────────────────────────────────── */}
      {(nextInterview.length > 0 || perfDev.length > 0) && (
        <div className="grid gap-5 md:grid-cols-2">
          {nextInterview.length > 0 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Bir Sonraki Mülakatta</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 pl-5 list-disc marker:text-muted-foreground">
                  {nextInterview.map((item, i) => (
                    <li key={i} className="text-[15px] text-zinc-700 leading-[1.7]">{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {perfDev.length > 0 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Performans Geliştirme</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 pl-5 list-disc marker:text-muted-foreground">
                  {perfDev.map((item, i) => (
                    <li key={i} className="text-[15px] text-zinc-700 leading-[1.7]">{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
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
          latest.analysisStatus?.audio
          && latest.analysisStatus?.audioLlm
          && latest.analysisStatus?.transcript
          && (!latest.analysisStatus?.vision || latest.analysisStatus?.visionLlm)
        );
        attempts += 1;
        if (!cancelled && !done && attempts < 20) {
          retryTimer = window.setTimeout(refresh, 2500);
        }
      } catch (error: unknown) {
        attempts += 1;
        const message = error instanceof Error ? error.message : "";
        const isTransientMissingReport =
          message.toLowerCase().includes("report not found")
          || message.toLowerCase().includes("request failed: 404");

        if (!cancelled && isTransientMissingReport && attempts < 20) {
          retryTimer = window.setTimeout(refresh, 1500);
          return;
        }

        if (!cancelled) {
          setRefreshError(error instanceof Error ? error.message : "Feedback yenilenemedi.");
        }
      }
    };

    refresh();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [sessionId]);

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

      <Tabs defaultValue="transcript" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-xl">
            <TabsTrigger value="transcript">Yanıt Analizi</TabsTrigger>
            <TabsTrigger value="audio">Ses Analizi</TabsTrigger>
            <TabsTrigger value="vision">Görüntü Analizi</TabsTrigger>
          </TabsList>


        <TabsContent value="transcript" className="space-y-6 pt-4">
          <TranscriptAnalysisTab report={report} />
        </TabsContent>

        <TabsContent value="audio" className="space-y-6 pt-4">
          <AudioAnalysisTab report={report} />
        </TabsContent>

        <TabsContent value="vision" className="space-y-6 pt-4">
          <VisionAnalysisTab report={report} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
