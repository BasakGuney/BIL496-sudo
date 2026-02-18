import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackReport } from "@/lib/types";

export function RecommendationList({ report }: { report: FeedbackReport }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Öneriler</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.recommendations.map((r, idx) => (
          <div key={idx} className="rounded-2xl border p-4">
            <p className="text-sm font-semibold">{r.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{r.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
