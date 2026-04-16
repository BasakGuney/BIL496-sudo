import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreHero } from "./ScoreHero";

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      card: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    };
  }
  if (score >= 60) {
    return {
      card: "bg-amber-500/10 border-amber-500/25 text-amber-400",
    };
  }
  return {
    card: "bg-red-500/10 border-red-500/25 text-red-400",
  };
}

function metricValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metricTone(value: number | null) {
  if (typeof value !== "number") {
    return {
      card: "border-enterprise-border bg-enterprise-surface-2",
      label: "text-enterprise-text-3",
      value: "text-enterprise-text-2",
    };
  }
  if (value >= 80) {
    return {
      card: "border-emerald-500/25 bg-emerald-500/10",
      label: "text-emerald-200",
      value: "text-emerald-300",
    };
  }
  if (value >= 60) {
    return {
      card: "border-amber-500/25 bg-amber-500/10",
      label: "text-amber-200",
      value: "text-amber-300",
    };
  }
  return {
    card: "border-red-500/25 bg-red-500/10",
    label: "text-red-200",
    value: "text-red-300",
  };
}

function MetricCell({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: number | null;
  highlighted?: boolean;
}) {
  const tone = metricTone(value);
  return (
    <div className={cn(
      "rounded-xl border px-3 py-3 min-h-[60px] transition-colors",
      tone.card,
      highlighted ? "ring-1 ring-enterprise-accent/25" : ""
    )}>
      <div className={cn("text-[10px] uppercase tracking-wider mb-1", tone.label)}>{label}</div>
      <div className={cn("text-lg font-extrabold leading-none", tone.value)}>
        {value === null ? "N/A" : value}
      </div>
    </div>
  );
}

export function TranscriptAnalysisTab({ report }: { report: any }) {
  const analysis = report?.transcriptAnalysis;
  const overall = analysis?.overall;
  const qaEvaluations = (Array.isArray(analysis?.qaEvaluations) ? analysis.qaEvaluations : []).filter((question: any) => {
    const questionType = String(question?.questionType || "").trim().toLowerCase();
    return questionType !== "meta" && question?.visibleInReport !== false && question?.excludedFromOverall !== true;
  });
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
    { key: "contentQuality", label: "İçerik Kalitesi", detail: "Sorulara teknik ve içeriksel uyum, derinlik seviyesi." },
    { key: "communicationClarity", label: "İfade ve Netlik", detail: "Anlatımın akışı, açıklık ve iletişim netliği." },
    { key: "roleReadiness", label: "Role Hazırlık", detail: "Pozisyona uygunluk ve mülakat olgunluğu." },
    { key: "technicalUnderstanding", label: "Teknik Yetkinlik", detail: "Teknik doğruluk ve konu hakimiyeti." },
  ].map((dimension) => ({
    ...dimension,
    score: typeof dimensionScores[dimension.key] === "number" ? Number(dimensionScores[dimension.key]) : null,
  }));

  const recommendationColumns = [
    { title: "Bir Sonraki Mülakatta", items: recommendations["Bir Sonraki Mülakatta"] || recommendations["Bir Sonraki Mulakatta"] || [] },
    { title: "Performans Geliştirme (Orta / Uzun Vade)", items: recommendations["Performans Geliştirme"] || recommendations["Performans Gelistirme"] || [] },
    { title: "Çalışma Planı", items: recommendations["Çalışma Planı"] || recommendations["Calisma Plani"] || [] },
  ];

  const qaMetrics = [
    { key: "relevance", label: "Uygunluk" },
    { key: "clarity", label: "Netlik" },
    { key: "depth", label: "Derinlik" },
    { key: "evidenceExample", label: "Örnekleme" },
    { key: "technicalAccuracy", label: "Teknik Doğruluk" },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <ScoreHero score={Number(overall.overallScore || 0)} />

        <div className="card-style bg-enterprise-surface p-6">
          <p className="text-[10px] font-bold text-enterprise-text-3 uppercase tracking-widest mb-3">Genel Değerlendirme</p>
          <p className="text-sm text-enterprise-text-2 leading-relaxed">
            {overall.overallAnalysis || "Değerlendirme hazırlanıyor."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {dimensions.map((dimension) => (
          <div key={dimension.key} className="card-style bg-enterprise-surface p-5">
            <p className="text-[11px] text-enterprise-text-3 mb-2">{dimension.label}</p>
            <div className={cn(
              "text-3xl font-black mb-2",
              typeof dimension.score === "number"
                ? "bg-gradient-to-r from-enterprise-accent to-enterprise-accent-2 bg-clip-text text-transparent"
                : "text-enterprise-text-3"
            )}>
              {typeof dimension.score === "number" ? dimension.score : "—"}
            </div>
            <p className="text-[11px] text-enterprise-text-3 mb-3 min-h-[38px]">{dimension.detail}</p>
            {typeof dimension.score === "number" ? (
              <Progress value={dimension.score} className="h-1.5 bg-enterprise-surface-2" />
            ) : (
              <div className="h-1.5 rounded-full border border-dashed border-enterprise-border bg-enterprise-surface-2/50" />
            )}
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
            {strengths.length > 0 ? (
              strengths.slice(0, 4).map((item: string, index: number) => <li key={index}>• {item}</li>)
            ) : (
              <li>• Belirgin güçlü yön tespit edilmedi.</li>
            )}
          </ul>
        </div>

        <div className="card-style bg-enterprise-surface p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Gelişim Alanları</h3>
          </div>
          <ul className="space-y-2 text-sm text-enterprise-text-2">
            {improvementAreas.length > 0 ? (
              improvementAreas.slice(0, 4).map((item: string, index: number) => <li key={index}>• {item}</li>)
            ) : (
              <li>• Belirgin gelişim alanı tespit edilmedi.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {recommendationColumns.map((column) => (
          <div key={column.title} className="card-style bg-enterprise-surface p-6">
            <h3 className="text-sm font-bold text-white mb-3">{column.title}</h3>
            <ul className="space-y-2 text-sm text-enterprise-text-2">
              {Array.isArray(column.items) && column.items.length > 0 ? (
                column.items.map((item: string, index: number) => <li key={index}>• {item}</li>)
              ) : (
                <li>• Öneri hazırlanıyor.</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="card-style bg-enterprise-surface p-6">
        <h3 className="text-sm font-bold text-white mb-4">Soru Bazlı Değerlendirme</h3>
        <div className="space-y-3">
          {qaEvaluations.map((question: any) => {
            const tone = scoreTone(Number(question.score || 0));
            const metrics = question.metrics || {};
            const applicableMetrics = Array.isArray(question.applicableMetrics) ? question.applicableMetrics : [];

            return (
              <div key={question.index} className="rounded-2xl border border-enterprise-border bg-enterprise-surface-2 p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Soru {question.index}</span>
                      <Badge className="text-[10px] border border-enterprise-accent/20 bg-enterprise-accent/10 text-enterprise-accent-2">
                        {String(question.questionType || "GENEL").toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-white leading-relaxed">{question.question}</p>
                  </div>
                  <div className={cn("rounded-xl border px-4 py-3 text-lg font-black min-w-[72px] text-center", tone.card)}>
                    {question.score ?? "-"}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5 mb-4">
                  {qaMetrics.map((metric) => {
                    const value = metricValue(metrics?.[metric.key]);
                    return (
                      <MetricCell
                        key={metric.key}
                        label={metric.label}
                        value={value}
                        highlighted={applicableMetrics.includes(metric.key)}
                      />
                    );
                  })}
                </div>

                <p className="text-sm text-enterprise-text-2 leading-relaxed">
                  {question.summary || "Bu soru için özet hazırlanıyor."}
                </p>
              </div>
            );
          })}
          {qaEvaluations.length === 0 && <div className="text-sm text-enterprise-text-3">Soru bazlı detay bulunamadı.</div>}
        </div>
      </div>
    </div>
  );
}
