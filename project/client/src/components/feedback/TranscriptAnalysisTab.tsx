import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export function TranscriptAnalysisTab({ report }: { report: any }) {
  const analysis = report?.transcriptAnalysis;
  const overall = analysis?.overall;
  const qaEvaluations = Array.isArray(analysis?.qaEvaluations) ? analysis.qaEvaluations : [];
  const recommendations = analysis?.newRecommendations || {};

  if (!overall) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-enterprise-surface border border-enterprise-border flex items-center justify-center mb-6 animate-pulse">
          <Target className="w-8 h-8 text-enterprise-accent opacity-50" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Yanıt Analizi Bekleniyor</h3>
        <p className="text-sm text-enterprise-text-2 max-w-xs mx-auto">Soru bazlı değerlendirmeler hazırlanıyor.</p>
      </div>
    );
  }

  const dimensionScores = overall.dimensionScores || {};
  const strengths = Array.isArray(overall.strengths) ? overall.strengths : [];
  const improvementAreas = Array.isArray(overall.improvementAreas) ? overall.improvementAreas : [];

  const dimensions = [
    { key: "contentQuality", label: "İçerik Kalitesi", detail: "Sorulara içeriksel uygunluk ve derinlik." },
    { key: "communicationClarity", label: "İfade ve Netlik", detail: "Anlatımın akışı ve açıklık seviyesi." },
    { key: "roleReadiness", label: "Role Hazırlık", detail: "Pozisyona hazırlık ve olgunluk." },
    { key: "technicalUnderstanding", label: "Teknik Yetkinlik", detail: "Teknik doğruluk ve hakimiyet." },
  ].map((d) => ({
    ...d,
    score: Number(dimensionScores[d.key] || 0),
  }));

  const recommendationColumns = [
    { title: "Bir Sonraki Mülakatta", items: recommendations["Bir Sonraki Mülakatta"] || [] },
    { title: "Performans Geliştirme (Orta / Uzun Vade)", items: recommendations["Performans Geliştirme"] || [] },
    { title: "Çalışma Planı", items: recommendations["Çalışma Planı"] || [] },
  ];

  const getScoreTone = (score: number) => {
    if (score >= 80) return "bg-emerald-500/10 border-emerald-500/25 text-emerald-400";
    if (score >= 60) return "bg-amber-500/10 border-amber-500/25 text-amber-400";
    return "bg-red-500/10 border-red-500/25 text-red-400";
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[200px_1fr_1fr]">
        <div className="card-style bg-enterprise-surface p-6 flex flex-col items-center justify-center">
          <div className="text-5xl font-black text-white">{Number(overall.overallScore || 0)}</div>
          <div className="text-xs text-enterprise-text-3 mt-1">/100</div>
          <Badge className="mt-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-wider">
            Genel Skor
          </Badge>
        </div>

        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] font-bold text-enterprise-text-3 uppercase tracking-widest mb-3">Genel Değerlendirme</p>
          <p className="text-sm text-enterprise-text-2 leading-relaxed">{overall.overallAnalysis || "Değerlendirme hazırlanıyor."}</p>
        </div>

        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] font-bold text-enterprise-text-3 uppercase tracking-widest mb-3">Analiz Durumu</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between bg-enterprise-surface-2 border border-enterprise-border rounded-lg px-3 py-2">
              <span className="text-enterprise-text-2">Yanıt Analizi</span>
              <span className="text-emerald-400 font-semibold">Tamamlandı</span>
            </div>
            <div className="flex items-center justify-between bg-enterprise-surface-2 border border-enterprise-border rounded-lg px-3 py-2">
              <span className="text-enterprise-text-2">Ses Analizi</span>
              <span className={report?.analysisStatus?.audioLlm ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                {report?.analysisStatus?.audioLlm ? "Tamamlandı" : "Ses analizi bekleniyor"}
              </span>
            </div>
            <div className="flex items-center justify-between bg-enterprise-surface-2 border border-enterprise-border rounded-lg px-3 py-2">
              <span className="text-enterprise-text-2">Görüntü Analizi</span>
              <span className={report?.analysisStatus?.visionLlm ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                {report?.analysisStatus?.visionLlm ? "Tamamlandı" : "Görüntü analizi bekleniyor"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {dimensions.map((dim) => (
          <div key={dim.key} className="card-style bg-enterprise-surface p-5">
            <p className="text-[11px] text-enterprise-text-3 mb-2">{dim.label}</p>
            <div className="text-3xl font-black text-white mb-2">{dim.score}</div>
            <p className="text-[11px] text-enterprise-text-3 mb-3 min-h-[34px]">{dim.detail}</p>
            <Progress value={dim.score} className="h-1.5 bg-enterprise-surface-2" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-style bg-enterprise-surface p-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Güçlü Yönler</h3>
          </div>
          <ul className="space-y-2 text-sm text-enterprise-text-2">
            {strengths.slice(0, 4).map((item: string, i: number) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </div>

        <div className="card-style bg-enterprise-surface p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Gelişim Alanları</h3>
          </div>
          <ul className="space-y-2 text-sm text-enterprise-text-2">
            {improvementAreas.slice(0, 4).map((item: string, i: number) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {recommendationColumns.map((col) => (
          <div key={col.title} className="card-style bg-enterprise-surface p-6">
            <h3 className="text-sm font-bold text-white mb-3">{col.title}</h3>
            <ul className="space-y-2 text-sm text-enterprise-text-2">
              {Array.isArray(col.items) && col.items.length > 0 ? col.items.map((item: string, i: number) => (
                <li key={i}>• {item}</li>
              )) : <li>• Öneri hazırlanıyor.</li>}
            </ul>
          </div>
        ))}
      </div>

      <div className="card-style bg-enterprise-surface p-6">
        <h3 className="text-sm font-bold text-white mb-4">Soru Bazlı Değerlendirme</h3>
        <div className="space-y-3">
          {qaEvaluations.map((q: any) => (
            <div key={q.index} className="rounded-xl border border-enterprise-border bg-enterprise-surface-2 p-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Soru {q.index}</span>
                    <Badge className="bg-enterprise-accent/10 border border-enterprise-accent/20 text-enterprise-accent-2 text-[10px]">
                      {q.questionType || "GENEL"}
                    </Badge>
                  </div>
                  <p className="text-sm text-white">{q.question}</p>
                  <p className="text-xs text-enterprise-text-2">{q.summary}</p>
                </div>
                <div className={cn("rounded-lg border px-3 py-2 text-lg font-black min-w-[72px] text-center", getScoreTone(Number(q.score || 0)))}>
                  {q.score ?? "-"}
                </div>
              </div>
            </div>
          ))}
          {qaEvaluations.length === 0 && (
            <div className="text-sm text-enterprise-text-3">Soru bazlı detay bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  );
}

