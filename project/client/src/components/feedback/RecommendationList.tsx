import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackRecommendation, FeedbackReport } from "@/lib/types";

export function RecommendationList({ report }: { report: FeedbackReport }) {
  const merged: FeedbackRecommendation[] = [
    ...(report.recommendations || []),
    ...(Array.isArray(report.transcriptAnalysis?.recommendations) ? report.transcriptAnalysis!.recommendations! : []),
    ...(Array.isArray(report.visionLlmAnalysis?.report?.recommendations) ? report.visionLlmAnalysis!.report!.recommendations! : []),
  ];

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Birleşik Öneriler</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {merged.length === 0 ? <div className="text-sm text-muted-foreground">Öneriler analiz çıktıları geldikçe burada listelenecek.</div> : null}
        {merged.map((r, idx) => (
          <div key={idx} className="rounded-2xl border p-4">
            <p className="text-sm font-semibold">{r.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{r.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
