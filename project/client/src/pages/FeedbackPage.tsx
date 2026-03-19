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
              <div className="mt-1 font-medium">%{vision.overview.facePresenceScore || 0}</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Kadraj skoru</div>
              <div className="mt-1 font-medium">{vision.overview.centeringScore}/100</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Stabilite skoru</div>
              <div className="mt-1 font-medium">{vision.overview.steadinessScore}/100</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Görsel gerginlik</div>
              <div className="mt-1 font-medium">{vision.tension.visualTensionScore ?? 0}/100</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Dikkat sapması</div>
              <div className="mt-1 font-medium">{vision.tension.attentionRiskScore}/100</div>
              <div className="text-xs text-muted-foreground">
                warn: {vision.tension.warnFrames} • danger: {vision.tension.dangerFrames}
              </div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Hareket kaynaklı risk</div>
              <div className="mt-1 font-medium">{vision.tension.movementRiskScore}/100</div>
              <div className="text-xs text-muted-foreground">
                raw movement: {vision.overview.headMovementRaw.toFixed(3)}
              </div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-muted-foreground">Göz görünürlüğü riski</div>
              <div className="mt-1 font-medium">{vision.tension.eyeTensionScore}/100</div>
              <div className="text-xs text-muted-foreground">
                low-eye frames: {vision.tension.lowEyeFrames}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ScoreBreakdown report={report} />
    </div>
  );
}
