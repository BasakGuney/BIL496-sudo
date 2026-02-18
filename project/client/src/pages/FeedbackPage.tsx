import { Button } from "@/components/ui/button";
import type { FeedbackReport } from "@/lib/types";
import { FeedbackSummary } from "@/components/feedback/FeedbackSummary";
import { ScoreBreakdown } from "@/components/feedback/ScoreBreakdown";
import { RecommendationList } from "@/components/feedback/RecommendationList";
import { RotateCcw } from "lucide-react";

export function FeedbackPage({ report, onNew }: { report: FeedbackReport; onNew: () => void }) {
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

      <ScoreBreakdown report={report} />
    </div>
  );
}
