import { useEffect, useMemo, useState } from "react";
import { listReports } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BarChart3, Clock3, FileText, Mic, Search, Video, CalendarDays, TrendingUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function HistoryPage({ onOpenReport }: { onOpenReport: (sid: string) => void }) {
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    listReports()
      .then((data) => {
        if (!mounted) return;
        setItems(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      return (
        i.sessionId.toLowerCase().includes(q) ||
        i.transcriptPreview?.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  const stats = useMemo(() => {
    const scores = items.map((i) => i.overallScore).filter((s): s is number => typeof s === "number");
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const max = scores.length ? Math.max(...scores) : 0;
    return { total: items.length, avg, max };
  }, [items]);

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto px-8 py-20 flex flex-col items-center justify-center text-enterprise-text-2">
        <div className="w-12 h-12 border-4 border-enterprise-accent/20 border-t-enterprise-accent rounded-full animate-spin mb-4" />
        <p className="font-bold uppercase tracking-widest text-xs">Geçmiş Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-8 py-10 space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-white mb-2">Mülakat Geçmişi ve Gelişim Analizi</h1>
          <p className="text-sm text-enterprise-text-3">Tüm oturumlarınızı ve genel trendinizi tek ekranda inceleyin.</p>
        </div>
        <Button className="h-11 px-5 rounded-xl bg-gradient-to-r from-enterprise-accent to-enterprise-accent-2 text-white font-semibold">
          <Plus className="w-4 h-4 mr-2" />
          Yeni Mülakat
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2 font-bold">Toplam Oturum</p>
          <p className="text-3xl font-black text-white">{stats.total}</p>
        </div>
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2 font-bold">Ortalama Skor</p>
          <p className="text-3xl font-black text-enterprise-accent-2">{stats.avg}</p>
        </div>
        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] uppercase tracking-widest text-enterprise-text-3 mb-2 font-bold">En Yüksek Skor</p>
          <p className="text-3xl font-black text-emerald-400">{stats.max}</p>
        </div>
      </section>

      <section className="card-style bg-enterprise-surface p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-enterprise-accent" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Tüm Oturumlar</h2>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-enterprise-text-3 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ID veya içerik ara..."
              className="pl-9 h-10 bg-enterprise-surface-2 border-enterprise-border"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.sessionId}
              className="rounded-2xl border border-enterprise-border bg-enterprise-surface-2 p-4 hover:border-enterprise-accent/30 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-enterprise-text-3" />
                    <span className="text-xs font-semibold text-white">#{item.sessionId.slice(0, 8)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-enterprise-text-3">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md border border-enterprise-border", item.hasTranscript ? "text-enterprise-accent" : "text-enterprise-text-3")}>
                      <FileText className="w-3 h-3" />
                    </span>
                    <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md border border-enterprise-border", item.hasAudio ? "text-enterprise-accent" : "text-enterprise-text-3")}>
                      <Mic className="w-3 h-3" />
                    </span>
                    <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md border border-enterprise-border", item.hasVision ? "text-enterprise-accent" : "text-enterprise-text-3")}>
                      <Video className="w-3 h-3" />
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between lg:justify-end gap-4">
                  <Badge className={cn(
                    "text-xs font-bold px-3 py-1 rounded-lg",
                    (item.overallScore ?? 0) >= 80
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  )}>
                    {typeof item.overallScore === "number" ? `${item.overallScore} / 100` : "Skor Yok"}
                  </Badge>
                  <Button
                    variant="outline"
                    className="h-9 px-4 border-enterprise-border text-enterprise-text-2 hover:text-white"
                    onClick={() => onOpenReport(item.sessionId)}
                  >
                    Raporu İncele
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-enterprise-border p-10 text-center text-enterprise-text-3">
              <div className="inline-flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span>Kayıt bulunamadı</span>
              </div>
              <p className="text-xs">Arama filtresini temizleyip tekrar deneyin.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

