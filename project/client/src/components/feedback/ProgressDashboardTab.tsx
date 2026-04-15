import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FeedbackReport, SessionSummary } from "@/lib/types";
import { getReport, listReports } from "@/lib/api";

type QaEvaluation = {
  questionType?: string;
  visibleInReport?: boolean;
  excludedFromOverall?: boolean;
  score?: number | null;
  metrics?: {
    relevance?: number | null;
    clarity?: number | null;
    depth?: number | null;
    evidenceExample?: number | null;
    technicalAccuracy?: number | null;
  } | null;
};

type ReportSession = {
  sessionId: string;
  createdAt: string;
  report: FeedbackReport;
};

type TagSessionScore = {
  overall: number;
  relevance: number | null;
  clarity: number | null;
  depth: number | null;
  evidenceExample: number | null;
  technicalAccuracy: number | null;
};

type TagSeriesPoint = {
  sessionId: string;
  createdAt: string;
  score: TagSessionScore;
};

type TagStat = {
  tag: string;
  label: string;
  values: number[];
  last: number;
  delta: number;
  status: {
    label: string;
    tone: "good" | "warn" | "stable";
    text: string;
  };
  metricAverages: Array<{ label: string; value: number; tone: string }>;
  weakestMetric: string;
  actionPlan: string[];
  sessionCount: number;
};

const TAG_LABELS: Record<string, string> = {
  self_presentation: "Kendini Tanıtma",
  motivation: "Motivasyon",
  behavioral: "Davranışsal",
  experience: "Deneyim",
  technical_knowledge: "Teknik Bilgi",
  technical_experience: "Teknik Deneyim",
  problem_solving: "Problem Çözme",
  meta: "Meta",
};

const TAG_ACTIONS: Record<string, string[]> = {
  self_presentation: [
    "Açılış cevabını 45-60 saniyelik net bir akışta ver.",
    "Eğitim, son deneyim ve güçlü yönünü tek çerçevede bağla.",
    "İlk cevaba rol için neden uygun olduğunu gösteren kısa bir örnek ekle.",
  ],
  motivation: [
    "Bu rolü neden istediğini şirket, rol ve kişisel hedef ekseninde anlat.",
    "Genel cümle yerine başvuru sebebini 1-2 somut gerekçeyle destekle.",
    "Motivasyonu geçmiş deneyimin ve gelecekteki hedefinle bağla.",
  ],
  behavioral: [
    "STAR yapısında özellikle Result kısmını daha ölçülebilir anlat.",
    "Takım başarısı ile bireysel katkını ayrı cümlelerde netleştir.",
    "Zor anlarda nasıl karar verdiğini ve ne öğrendiğini vurgula.",
  ],
  experience: [
    "Deneyim sorularında bağlam, sorumluluk ve çıktı sırasını koru.",
    "Staj veya proje anlatırken yalnızca görevleri değil etkini de söyle.",
    "Her deneyim için akılda kalıcı tek bir örnek hazırlayıp tekrar et.",
  ],
  technical_knowledge: [
    "Bir kavramı tanım, kullanım alanı ve trade-off ile anlat.",
    "Teknik sorularda cevap yapını kısa tanım artı örnek şeklinde kur.",
    "Bildiğin ve bilmediğin kısmı ayırarak daha güvenilir cevap ver.",
  ],
  technical_experience: [
    "Kullandığın araçları neden seçtiğini ve sonuç etkisini birlikte anlat.",
    "Teknik deneyim cevabında süreç, karar ve çıktı zincirini koru.",
    "Metrik, performans veya çıktı varsa sayısal biçimde ekle.",
  ],
  problem_solving: [
    "Varsayımları çözümden önce açıkça söyle.",
    "Adımları sırayla ve her adımın gerekçesiyle anlat.",
    "Çözümün sonunda performans veya risk etkisini değerlendir.",
  ],
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value);
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tagLabel(tag: string) {
  return TAG_LABELS[tag] || tag.replaceAll("_", " ");
}

function trendStatus(delta: number) {
  if (delta >= 3) {
    return { label: "Gelişiyor", tone: "good" as const, text: "Son oturumlarda belirgin bir artış var." };
  }
  if (delta <= -3) {
    return { label: "Dikkat", tone: "warn" as const, text: "Son oturumlarda düşüş görülüyor; odaklı tekrar faydalı olur." };
  }
  return { label: "Stabil", tone: "stable" as const, text: "Seviye korunuyor; küçük dalgalanmalar normal." };
}

function pillClass(tone: "good" | "warn" | "stable") {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function sparkline(values: number[]) {
  const width = 120;
  const height = 38;
  const pad = 4;
  const min = Math.min(...values, 40);
  const max = Math.max(...values, 90);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = pad + index * step;
    const y = height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-[120px]" aria-label="trend">
      <polyline
        fill="none"
        stroke="#0f5ea6"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function metricAverage(points: TagSeriesPoint[], key: keyof TagSessionScore) {
  const values = points
    .map((point) => point.score[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? average(values) : 0;
}

function extractTagScores(report: FeedbackReport) {
  const analysis = report.transcriptAnalysis as { qaEvaluations?: QaEvaluation[] } | null | undefined;
  const qaEvaluations = Array.isArray(analysis?.qaEvaluations) ? analysis.qaEvaluations : [];
  const grouped = new Map<string, QaEvaluation[]>();

  qaEvaluations.forEach((qa) => {
    const tag = String(qa.questionType || "").trim();
    if (!tag || tag === "meta") return;
    if (qa.visibleInReport === false || qa.excludedFromOverall === true) return;
    const bucket = grouped.get(tag) || [];
    bucket.push(qa);
    grouped.set(tag, bucket);
  });

  const result = new Map<string, TagSessionScore>();
  grouped.forEach((items, tag) => {
    const scoreValues = items.map((item) => toNumber(item.score)).filter((value): value is number => value !== null);
    const relevanceValues = items.map((item) => toNumber(item.metrics?.relevance)).filter((value): value is number => value !== null);
    const clarityValues = items.map((item) => toNumber(item.metrics?.clarity)).filter((value): value is number => value !== null);
    const depthValues = items.map((item) => toNumber(item.metrics?.depth)).filter((value): value is number => value !== null);
    const evidenceValues = items.map((item) => toNumber(item.metrics?.evidenceExample)).filter((value): value is number => value !== null);
    const technicalValues = items.map((item) => toNumber(item.metrics?.technicalAccuracy)).filter((value): value is number => value !== null);

    result.set(tag, {
      overall: scoreValues.length ? average(scoreValues) : 0,
      relevance: relevanceValues.length ? average(relevanceValues) : null,
      clarity: clarityValues.length ? average(clarityValues) : null,
      depth: depthValues.length ? average(depthValues) : null,
      evidenceExample: evidenceValues.length ? average(evidenceValues) : null,
      technicalAccuracy: technicalValues.length ? average(technicalValues) : null,
    });
  });

  return result;
}

function buildTagStats(sessions: ReportSession[]) {
  const sortedSessions = [...sessions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const tagSeries = new Map<string, TagSeriesPoint[]>();

  sortedSessions.forEach((session) => {
    const scores = extractTagScores(session.report);
    scores.forEach((score, tag) => {
      const bucket = tagSeries.get(tag) || [];
      bucket.push({
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        score,
      });
      tagSeries.set(tag, bucket);
    });
  });

  const stats: TagStat[] = [];
  tagSeries.forEach((points, tag) => {
    const values = points.map((point) => point.score.overall);
    const recentCount = Math.min(3, values.length);
    const baseCount = Math.min(3, values.length);
    const firstAvg = average(values.slice(0, baseCount));
    const lastAvg = average(values.slice(-recentCount));
    const delta = Number((lastAvg - firstAvg).toFixed(1));
    const last = values[values.length - 1] || 0;
    const metricAverages = [
      { label: "Uygunluk", value: metricAverage(points, "relevance"), tone: "#275f96" },
      { label: "Netlik", value: metricAverage(points, "clarity"), tone: "#3a74aa" },
      { label: "Derinlik", value: metricAverage(points, "depth"), tone: "#4d89bf" },
      { label: "Örnekleme", value: metricAverage(points, "evidenceExample"), tone: "#e08c2f" },
      { label: "Teknik Doğruluk", value: metricAverage(points, "technicalAccuracy"), tone: "#0f766e" },
      { label: "Genel", value: average(values), tone: "#194e84" },
    ].filter((metric) => metric.value > 0);

    const weakestMetric = [...metricAverages].sort((a, b) => a.value - b.value)[0]?.label || "Genel";

    stats.push({
      tag,
      label: tagLabel(tag),
      values,
      last,
      delta,
      status: trendStatus(delta),
      metricAverages,
      weakestMetric,
      actionPlan: TAG_ACTIONS[tag] || [
        "Bu etiket için cevap yapını net başlıklarla kur.",
        "Somut örnek veya çıktı ekleyerek cevabı güçlendir.",
        "Bir sonraki oturumda bu etikete özel kısa prova yap.",
      ],
      sessionCount: points.length,
    });
  });

  return stats.sort((a, b) => a.last - b.last || a.delta - b.delta);
}

export function ProgressDashboardTab({
  currentReport,
  currentSessionId,
  limit = 10,
}: {
  currentReport?: FeedbackReport | null;
  currentSessionId?: string | null;
  limit?: number;
}) {
  const [history, setHistory] = useState<ReportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError("");
      try {
        const summaries = await listReports(limit);
        const summaryMap = new Map<string, SessionSummary>();
        summaries.forEach((summary) => summaryMap.set(summary.sessionId, summary));

        const sessionIds = Array.from(
          new Set(
            [currentSessionId, ...summaries.map((item) => item.sessionId)].filter(
              (sessionId): sessionId is string => Boolean(sessionId)
            )
          )
        );
        const reports = await Promise.all(
          sessionIds.map(async (sessionId) => {
            if (currentReport && sessionId === currentSessionId) {
              return { sessionId, report: currentReport };
            }
            try {
              const report = await getReport(sessionId);
              return { sessionId, report };
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;

        const usable = reports
          .filter((item): item is { sessionId: string; report: FeedbackReport } => Boolean(item))
          .map((item) => ({
            sessionId: item.sessionId,
            createdAt: summaryMap.get(item.sessionId)?.createdAt || new Date().toISOString(),
            report: item.report,
          }))
          .filter((item) => item.report?.transcriptAnalysis);

        setHistory(usable);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setHistory([]);
          setError(loadError instanceof Error ? loadError.message : "Gelişim paneli yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [currentReport, currentSessionId, limit]);

  const stats = useMemo(() => buildTagStats(history), [history]);
  const averageTrend = stats.length ? Number((average(stats.map((item) => item.delta))).toFixed(1)) : 0;
  const averageTrendStatus = trendStatus(averageTrend);
  const priorityTag = stats[0] || null;

  if (loading) {
    return (
      <Card className="rounded-2xl border-slate-200 bg-white">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Gelişim paneli için geçmiş oturumlar yükleniyor...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
        <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (history.length < 2 || stats.length === 0) {
    return (
      <Card className="rounded-2xl border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Gelişim Paneli</CardTitle>
          <CardDescription>
            Bu paneli anlamlı gösterebilmek için en az 2 transcript analizli oturum gerekiyor.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl bg-[linear-gradient(180deg,#f9fbff_0%,#f4f7fb_55%,#edf3f9_100%)] p-2 md:p-6">
      <div className="rounded-[22px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Soru Etiketi Bazlı Gelişim Paneli</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-slate-600">
          Geçmiş oturumlardaki transcript sonuçları bir araya getirilerek soru tipi bazında trend, alt metrikler ve kısa aksiyon planı gösterilir.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="rounded-[20px] border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Toplam Oturum</div>
            <div className="mt-2 text-4xl font-extrabold text-slate-900">{history.length}</div>
            <p className="mt-3 text-sm leading-6 text-slate-600">Karşılaştırmaya dahil edilen transcript analizli oturum sayısı.</p>
          </CardContent>
        </Card>

        <Card className="rounded-[20px] border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Etiket Sayısı</div>
            <div className="mt-2 text-4xl font-extrabold text-slate-900">{stats.length}</div>
            <p className="mt-3 text-sm leading-6 text-slate-600">Trend ve detay kartı üretilen soru tipi sayısı.</p>
          </CardContent>
        </Card>

        <Card className="rounded-[20px] border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ortalama Etiket Eğilimi</div>
            <div className="mt-2 text-4xl font-extrabold text-slate-900">
              {averageTrend > 0 ? "+" : ""}
              {averageTrend}
            </div>
            <Badge variant="outline" className={`mt-3 rounded-full ${pillClass(averageTrendStatus.tone)}`}>
              {averageTrendStatus.label}
            </Badge>
            <p className="mt-3 text-sm leading-6 text-slate-600">{averageTrendStatus.text}</p>
          </CardContent>
        </Card>

        <Card className="rounded-[20px] border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Öncelikli Gelişim Etiketi</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {priorityTag ? priorityTag.label : "-"}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {priorityTag
                ? `Son skor ${round(priorityTag.last)}. Bu etiket önce güçlendirilirse genel tablo en hızlı toparlanır.`
                : "Henüz hesaplanamadı."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card className="rounded-[20px] border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Etiket Bazlı Karşılaştırma</CardTitle>
            <CardDescription>
              Her satır bir soru tipi. İlk oturum ortalamaları ile son oturum eğilimi birlikte izlenir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                    <th className="px-2 py-3 font-semibold">Soru Etiketi</th>
                    <th className="px-2 py-3 font-semibold">Son Skor</th>
                    <th className="px-2 py-3 font-semibold">3 Oturum Değişim</th>
                    <th className="px-2 py-3 font-semibold">Trend</th>
                    <th className="px-2 py-3 font-semibold">Mini Grafik</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat) => (
                    <tr key={stat.tag} className="border-b border-slate-100 align-middle">
                      <td className="px-2 py-3 font-medium text-slate-900">{stat.label}</td>
                      <td className="px-2 py-3 font-semibold text-slate-900">{round(stat.last)}</td>
                      <td className="px-2 py-3 text-slate-700">
                        {stat.delta > 0 ? "+" : ""}
                        {stat.delta}
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant="outline" className={`rounded-full ${pillClass(stat.status.tone)}`}>
                          {stat.status.label}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">{sparkline(stat.values)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[20px] border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Sistem Özeti</CardTitle>
            <CardDescription>Geçmiş oturumlar birlikte okunarak oluşturulan kısa yorum.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
              <div className="text-sm font-semibold text-slate-900">Genel Eğilim</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {averageTrend >= 3
                  ? "Genel trend pozitif. Birden fazla soru tipinde yukarı yönlü hareket görülüyor."
                  : averageTrend <= -3
                    ? "Genel trend dalgalı. Bazı soru tiplerinde tekrar ve yapılandırılmış prova faydalı olur."
                    : "Genel tablo stabil. Büyük kırılma yerine etiket bazlı hedefli iyileştirme daha etkili görünüyor."}
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
              <div className="text-sm font-semibold text-slate-900">En Güçlü Etiket</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {stats.length ? `${stats[stats.length - 1].label} son oturumlarda daha yüksek ve daha dengeli gidiyor.` : "-"}
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
              <div className="text-sm font-semibold text-slate-900">Öncelikli Odak</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {priorityTag ? `${priorityTag.label} için özellikle ${priorityTag.weakestMetric.toLowerCase()} metriği önce toparlanmalı.` : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[20px] border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Tüm Etiketler İçin Detay ve Plan</CardTitle>
          <CardDescription>
            Her soru tipi için ortalama alt metrikler, trend ve pratik planı aynı anda gösterilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {stats.map((stat) => (
              <article key={stat.tag} className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{stat.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Son skor <strong>{round(stat.last)}</strong> | 3 oturum değişim{" "}
                      <strong>
                        {stat.delta > 0 ? "+" : ""}
                        {stat.delta}
                      </strong>
                    </p>
                  </div>
                  <Badge variant="outline" className={`rounded-full ${pillClass(stat.status.tone)}`}>
                    {stat.status.label}
                  </Badge>
                </div>

                <div className="mt-4 space-y-3">
                  {stat.metricAverages.map((metric) => (
                    <div key={`${stat.tag}-${metric.label}`}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="text-slate-700">{metric.label}</span>
                        <strong className="text-slate-900">{round(metric.value)}</strong>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${round(metric.value)}%`, backgroundColor: metric.tone }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-sm font-semibold text-slate-900">Bu etiket için plan</div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
                    {stat.actionPlan.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="mt-3 text-xs text-slate-500">
                    Hedef: {stat.weakestMetric} metriğini önümüzdeki 2 oturumda görünür biçimde yükseltmek.
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Bu etiket {stat.sessionCount} oturumda gözlendi.</div>
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
