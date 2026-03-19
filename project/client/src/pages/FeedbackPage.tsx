import { Button } from "@/components/ui/button";
import type { FeedbackReport } from "@/lib/types";
import { FeedbackSummary } from "@/components/feedback/FeedbackSummary";
import { ScoreBreakdown } from "@/components/feedback/ScoreBreakdown";
import { RecommendationList } from "@/components/feedback/RecommendationList";
import { RotateCcw } from "lucide-react";

export function FeedbackPage({ report, onNew }: { report: FeedbackReport; onNew: () => void }) {
  const vision = report.visionAnalysis;

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

      <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <FeedbackSummary report={report} />
        <RecommendationList report={report} />
      </div>

      {vision ? (
        <div className="rounded-2xl border p-4">
          <div className="text-sm font-semibold">Görüntü Analizi Özeti</div>
          <div className="mt-2 grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Durum</div>
              <div className="mt-1 font-medium">{vision.status}</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Yüz görünürlüğü</div>
              <div className="mt-1 font-medium">%{Math.round((vision.summary.facePresenceRatio || 0) * 100)}</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Kadraj skoru</div>
              <div className="mt-1 font-medium">{vision.summary.centeringScore}/100</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Stabilite skoru</div>
              <div className="mt-1 font-medium">{vision.summary.steadinessScore}/100</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Görsel gerginlik</div>
              <div className="mt-1 font-medium">{vision.summary.visualTensionScore ?? 0}/100</div>
            </div>
          </div>
          {vision.notes?.length ? (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {vision.notes.map((note, index) => (
                <li key={index}>• {note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ScoreBreakdown report={report} />
    </div>
  );
}
