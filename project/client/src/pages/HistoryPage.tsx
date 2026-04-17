import { useCallback, useEffect, useMemo, useState } from "react";
import { getHistoryInsights, getReport, listReports } from "@/lib/api";
import type { HistoryInsights, SessionSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BarChart3,
  FileText,
  Mic,
  Sparkles,
  Target,
  TrendingUp,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function getScoreTone(score: number | null) {
  if (typeof score !== "number") return "bg-enterprise-surface text-enterprise-text-3 border border-enterprise-border";
  if (score >= 80) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (score >= 60) return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  return "bg-red-500/10 text-red-400 border border-red-500/20";
}

function getScopeTone(active: boolean) {
  return active
    ? "border-sky-500/20 bg-sky-500/10 text-sky-400"
    : "border-enterprise-border bg-enterprise-bg/40 text-enterprise-text-3";
}

function normalizeInterviewTypeValue(value: string) {
  const normalized = String(value || "").trim().toLocaleLowerCase("tr-TR");
  if (normalized === "hr" || normalized === "ik" || normalized === "i̇k") return "HR";
  if (normalized === "technical" || normalized === "teknik") return "Technical";
  return "";
}

function normalizeModeValue(value: string) {
  const normalized = String(value || "").trim().toLocaleLowerCase("tr-TR");
  if (normalized === "supportive" || normalized.includes("destek")) return "Supportive";
  if (normalized === "neutral" || normalized.includes("nötr") || normalized.includes("notr")) return "Neutral";
  return "";
}

function sparkline(values: number[]) {
  const width = 100;
  const height = 30;
  const pad = 4;
  const min = Math.min(...values, 20);
  const max = Math.max(...values, 90);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values
    .map((value, index) => {
      const x = pad + index * step;
      const y = height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-[100px]" aria-hidden="true">
      <polyline
        fill="none"
        stroke="#5b8af7"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

const CHART_COLORS = ["#5B8AF7", "#16C784", "#F59E0B", "#8B5CF6", "#EF4444"];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-enterprise-border bg-[#0f1221]/95 px-3 py-2 shadow-2xl backdrop-blur">
      {label ? <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-enterprise-text-3">{label}</p> : null}
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={`${entry.name || "value"}-${index}`} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-enterprise-text-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color || "#5B8AF7" }} />
              {entry.name || "Değer"}
            </span>
            <span className="font-bold text-white">{Number(entry.value || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HistoryPage({ onOpenReport }: { onOpenReport: (sid: string) => void }) {
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [insights, setInsights] = useState<HistoryInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportMeta, setReportMeta] = useState<Record<string, { role?: string; mode?: string; interviewType?: string }>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");

  useEffect(() => {
    let mounted = true;

    Promise.allSettled([listReports(), getHistoryInsights(3)]).then((results) => {
      if (!mounted) return;

      const reportsResult = results[0];
      const insightsResult = results[1];

      if (reportsResult.status === "fulfilled") {
        setItems(reportsResult.value);
      } else {
        console.error(reportsResult.reason);
        setItems([]);
      }

      if (insightsResult.status === "fulfilled") {
        setInsights(insightsResult.value);
      } else {
        console.error(insightsResult.reason);
        setInsights(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );

  useEffect(() => {
    let mounted = true;

    if (sortedItems.length === 0) return () => { mounted = false; };

    Promise.allSettled(sortedItems.map((item) => getReport(item.sessionId))).then((results) => {
      if (!mounted) return;

      const nextMeta: Record<string, { role?: string; mode?: string; interviewType?: string }> = {};
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const report = result.value as {
          sessionConfig?: { role?: string; mode?: string; interviewType?: string };
          config?: { role?: string; mode?: string; interviewType?: string };
        };
        nextMeta[sortedItems[index].sessionId] = {
          role: String(report?.sessionConfig?.role || report?.config?.role || "").trim(),
          mode: String(report?.sessionConfig?.mode || report?.config?.mode || "").trim(),
          interviewType: String(report?.sessionConfig?.interviewType || report?.config?.interviewType || "").trim(),
        };
      });
      setReportMeta(nextMeta);
    }).catch(() => {
      if (mounted) setReportMeta({});
    });

    return () => {
      mounted = false;
    };
  }, [sortedItems]);

  const stats = useMemo(() => {
    const scores = sortedItems.map((item) => item.overallScore).filter((score): score is number => typeof score === "number");
    const avg = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    const strongestArea = insights?.trendMetrics?.length
      ? [...insights.trendMetrics].sort((a, b) => b.latestScore - a.latestScore)[0]?.label || "Veri Toplanıyor"
      : "Veri Toplanıyor";
    const focusArea = insights?.trendMetrics?.[0]?.label || "Yanıt Analizi";

    return {
      total: sortedItems.length,
      avg,
      strongestArea,
      focusArea,
      recentAverage: insights?.recentReports?.length
        ? Math.round(
            insights.recentReports.reduce((sum, report) => sum + Number(report.transcriptOverallScore || report.overallScore || 0), 0) /
              insights.recentReports.length
          )
        : avg,
    };
  }, [insights, sortedItems]);

  const resolveSessionMeta = useCallback((item: SessionSummary) => {
    const meta = reportMeta[item.sessionId] || {};
    const summaryMeta = item.sessionConfig || {};
    const role = meta.role || summaryMeta.role || "Mülakat Oturumu";
    const interviewTypeValue = meta.interviewType || summaryMeta.interviewType || "";
    const modeValue = meta.mode || summaryMeta.mode || "";
    const interviewType = interviewTypeValue === "HR" ? "İK" : interviewTypeValue === "Technical" ? "Teknik" : "Mülakat";
    const mode = modeValue === "Supportive" ? "Destekleyici Mod (Supportive)" : modeValue === "Neutral" ? "Nötr Mod (Neutral)" : "Mod";
    return { role, interviewType, mode };
  }, [reportMeta]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("tr-TR");

    const filtered = sortedItems.filter((item) => {
      const meta = resolveSessionMeta(item);
      const rawType = normalizeInterviewTypeValue(meta.interviewType);
      const rawMode = normalizeModeValue(meta.mode);

      if (typeFilter !== "all" && rawType !== typeFilter) return false;
      if (modeFilter !== "all" && rawMode !== modeFilter) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        item.sessionId,
        meta.role,
        meta.interviewType,
        meta.mode,
        item.transcriptPreview,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return haystack.includes(normalizedSearch);
    });

    filtered.sort((a, b) => {
      if (sortBy === "date_asc") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "score_desc") {
        return Number(b.overallScore ?? -1) - Number(a.overallScore ?? -1);
      }
      if (sortBy === "score_asc") {
        return Number(a.overallScore ?? 999) - Number(b.overallScore ?? 999);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return filtered;
  }, [resolveSessionMeta, sortedItems, searchTerm, typeFilter, modeFilter, sortBy]);

  const chartData = useMemo(() => {
    const recentScoreTrend = [...filteredItems]
      .slice(0, 8)
      .reverse()
      .map((item, index) => ({
        index: index + 1,
        score: typeof item.overallScore === "number" ? item.overallScore : 0,
        label: new Date(item.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }),
      }));

    const typeCountMap = filteredItems.reduce<Record<string, number>>((acc, item) => {
      const meta = resolveSessionMeta(item);
      const type = normalizeInterviewTypeValue(meta.interviewType);
      const label = type === "HR" ? "IK" : type === "Technical" ? "Teknik" : "Diger";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    const typeDistribution = Object.entries(typeCountMap).map(([name, value], index) => ({
      name,
      value,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));

    return {
      recentScoreTrend,
      typeDistribution,
    };
  }, [filteredItems, resolveSessionMeta]);

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto px-8 py-20 flex flex-col items-center justify-center text-enterprise-text-2">
        <div className="w-12 h-12 border-4 border-enterprise-accent/20 border-t-enterprise-accent rounded-full animate-spin mb-4" />
        <p className="font-bold uppercase tracking-widest text-xs">Geçmiş yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-8 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-[26px] font-extrabold tracking-tight text-white">Mülakat Geçmişi ve Gelişim Analizi</h1>
        <p className="text-sm text-enterprise-text-3">Tüm oturumlarınızı ve genel gelişim çizginizi tek ekranda inceleyin.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2 font-bold">Toplam Oturum</p>
          <p className="text-3xl font-black text-white">{stats.total}</p>
        </div>
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2 font-bold">Ortalama Skor</p>
          <p className="text-3xl font-black text-enterprise-accent-2">{stats.avg}</p>
        </div>
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2 font-bold">En Güçlü Alan</p>
          <p className="text-2xl font-black text-white leading-tight">{stats.strongestArea}</p>
        </div>
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2 font-bold">Gelişim Odağı</p>
          <p className="text-2xl font-black text-white leading-tight">{stats.focusArea}</p>
        </div>
      </section>

      <section className="card-style bg-enterprise-surface p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white mb-1">Gelişim Paneli</h2>
            <p className="text-sm text-enterprise-text-3">Son 3 raporun yanıt analizi etiketleri ve gelişim alanlarına göre hazırlandı.</p>
          </div>
          <Badge className="w-fit bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full">
            Son 3 rapor ortalaması: {stats.recentAverage}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-1">
            {(insights?.trendMetrics || []).map((metric) => (
              <div key={metric.tag} className="flex items-center justify-between py-4 border-b border-enterprise-border last:border-b-0 gap-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl border border-enterprise-border bg-enterprise-surface-2 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-4 h-4 text-enterprise-accent-2" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{metric.label}</p>
                    <p className="text-xs text-enterprise-text-3 truncate">Son 3 rapordaki etiket trendi</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {sparkline(metric.scores)}
                  <div className="text-right min-w-[54px]">
                    <p className="text-lg font-black text-white">{metric.latestScore}</p>
                    <p className={cn("text-xs font-semibold", metric.delta >= 0 ? "text-emerald-400" : "text-amber-400")}>
                      {metric.delta >= 0 ? `+${metric.delta}` : metric.delta}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {(!insights || insights.trendMetrics.length === 0) && (
              <div className="rounded-2xl border border-dashed border-enterprise-border p-8 text-center text-enterprise-text-3 text-sm">
                {sortedItems.length > 0
                  ? "Gelişim paneli hazırlanıyor. Backend yeniden başlatıldığında GPT yorumları ve etiket trendleri burada görünecek."
                  : "Gelişim paneli için yeterli transcript etiketi bulunamadı."}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-enterprise-accent/20 bg-enterprise-accent/5 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl border border-white/10 bg-enterprise-surface/80 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-enterprise-accent-2" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Haftalık Başarı</h3>
                  <p className="text-sm text-enterprise-text-2 leading-relaxed">
                    {insights?.commentary?.weeklyWin || "Son raporlar geldikçe bu alan GPT yorumu ile doldurulacak."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl border border-white/10 bg-enterprise-surface/80 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">En Güçlü Alan</h3>
                  <p className="text-sm text-enterprise-text-2 leading-relaxed">
                    {insights?.commentary?.strongestArea || "En güçlü alan yorumu raporlar geldikçe güncellenecek."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl border border-white/10 bg-enterprise-surface/80 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Öncelikli Odak</h3>
                  <p className="text-sm text-enterprise-text-2 leading-relaxed">
                    {insights?.commentary?.priorityFocus || "Öncelikli odak alanı son raporlara göre oluşturulacak."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="card-style bg-enterprise-surface p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-enterprise-text-3">Skor Trendi</p>
              <h2 className="text-lg font-black text-white">Son oturum performans akisi</h2>
              <p className="mt-1 text-sm text-enterprise-text-3">Filtrelenmis oturumlar icinde son 8 skorun degisimi.</p>
            </div>
            <Badge className="w-fit rounded-full border border-enterprise-accent/20 bg-enterprise-accent/10 px-3 py-1.5 text-enterprise-accent-2">
              Ortalama: {stats.avg}
            </Badge>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.recentScoreTrend} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreTrendStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5B8AF7" />
                    <stop offset="100%" stopColor="#7DD3FC" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8A90B9", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#8A90B9", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Skor"
                  stroke="url(#scoreTrendStroke)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#5B8AF7", stroke: "#0f1221", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#7DD3FC", stroke: "#0f1221", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-style bg-enterprise-surface p-6">
          <div className="mb-5">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-enterprise-text-3">Tip Dagilimi</p>
            <h2 className="text-lg font-black text-white">Mülakat karmasi</h2>
            <p className="mt-1 text-sm text-enterprise-text-3">IK ve teknik oturumlarin dagilimi.</p>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.typeDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={4}
                >
                  {chartData.typeDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 space-y-2">
            {chartData.typeDistribution.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between rounded-xl border border-enterprise-border bg-enterprise-bg/25 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-enterprise-text-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
                <span className="font-bold text-white">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card-style bg-enterprise-surface p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-enterprise-accent" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Tüm Oturumlar</h2>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[780px]">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rol, mod veya ID ara"
                className="h-10 border-enterprise-border bg-enterprise-bg/40 text-white placeholder:text-enterprise-text-3"
              />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-10 border-enterprise-border bg-enterprise-bg/40 text-white">
                  <SelectValue placeholder="Mülakat Tipi" />
                </SelectTrigger>
                <SelectContent className="bg-enterprise-surface border-enterprise-border text-white">
                  <SelectItem value="all">Tüm Tipler</SelectItem>
                  <SelectItem value="HR">İK</SelectItem>
                  <SelectItem value="Technical">Teknik</SelectItem>
                </SelectContent>
              </Select>
              <Select value={modeFilter} onValueChange={setModeFilter}>
                <SelectTrigger className="h-10 border-enterprise-border bg-enterprise-bg/40 text-white">
                  <SelectValue placeholder="Mod" />
                </SelectTrigger>
                <SelectContent className="bg-enterprise-surface border-enterprise-border text-white">
                  <SelectItem value="all">Tüm Modlar</SelectItem>
                  <SelectItem value="Supportive">Destekleyici</SelectItem>
                  <SelectItem value="Neutral">Nötr</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-10 border-enterprise-border bg-enterprise-bg/40 text-white">
                  <SelectValue placeholder="Sıralama" />
                </SelectTrigger>
                <SelectContent className="bg-enterprise-surface border-enterprise-border text-white">
                  <SelectItem value="date_desc">En Yeni</SelectItem>
                  <SelectItem value="date_asc">En Eski</SelectItem>
                  <SelectItem value="score_desc">Skor: Yüksekten</SelectItem>
                  <SelectItem value="score_asc">Skor: Düşükten</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-enterprise-border bg-enterprise-bg/20">
            <div className="grid grid-cols-[1.1fr_1.25fr_0.8fr_0.55fr_0.9fr] gap-4 px-5 py-4 border-b border-enterprise-border text-[10px] font-bold uppercase tracking-[0.18em] text-enterprise-text-3">
              <div>ID &amp; Tarih</div>
              <div>Mülakat Rolü &amp; Mod</div>
              <div>Analiz Kapsamı</div>
              <div>Genel Skor</div>
              <div>Aksiyon</div>
            </div>

            <div className="divide-y divide-enterprise-border">
              {filteredItems.map((item) => {
                const meta = resolveSessionMeta(item);
                const scoreTone = getScoreTone(item.overallScore);
                return (
                  <div
                    key={item.sessionId}
                    className="grid grid-cols-[1.1fr_1.25fr_0.8fr_0.55fr_0.9fr] gap-4 px-5 py-4 items-center bg-enterprise-surface-2/70 hover:bg-enterprise-surface-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">
                        {new Date(item.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}, {new Date(item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-[11px] text-enterprise-text-3">#{item.sessionId.slice(0, 8).toUpperCase()}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{meta.role}</p>
                      <p className="text-[11px] text-enterprise-text-3 truncate">{meta.interviewType} · {meta.mode}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={cn("relative inline-flex items-center justify-center w-7 h-7 rounded-lg border", getScopeTone(item.hasTranscript))}>
                        <FileText className="w-3 h-3" />
                        {item.hasTranscript && <span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-emerald-400" />}
                      </span>
                      <span className={cn("relative inline-flex items-center justify-center w-7 h-7 rounded-lg border", getScopeTone(item.hasAudio))}>
                        <Mic className="w-3 h-3" />
                        {item.hasAudio && <span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-emerald-400" />}
                      </span>
                      <span className={cn("relative inline-flex items-center justify-center w-7 h-7 rounded-lg border", getScopeTone(item.hasVision))}>
                        <Video className="w-3 h-3" />
                        {item.hasVision && <span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-emerald-400" />}
                      </span>
                    </div>

                    <Badge className={cn("inline-flex w-fit justify-center text-sm font-bold px-3 py-1.5 rounded-lg", scoreTone)}>
                      {typeof item.overallScore === "number" ? `${item.overallScore} / 100` : "Skor Yok"}
                    </Badge>

                    <Button
                      variant="outline"
                      className="h-9 px-4 justify-self-start border-enterprise-border text-enterprise-text-2 hover:text-white rounded-xl bg-enterprise-bg/30"
                      onClick={() => onOpenReport(item.sessionId)}
                    >
                      Raporu İncele
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {filteredItems.length === 0 && (
            <div className="rounded-2xl border border-dashed border-enterprise-border p-10 text-center text-enterprise-text-3">
              <div className="inline-flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span>Kayıt bulunamadı</span>
              </div>
              <p className="text-xs">Yeni oturumlar tamamlandıkça bu alanda listelenecek.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
