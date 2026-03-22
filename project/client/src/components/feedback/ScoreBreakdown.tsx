import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackMetric, FeedbackReport } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function MetricList({ title, items, description }: { title: string; items: FeedbackMetric[]; description: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <Badge variant="outline" className="rounded-full">0-100</Badge>
      </div>
      <div className="mt-3 space-y-3">
        {items.length === 0 ? <div className="text-sm text-muted-foreground">Bu bölüm için henüz metrik yok.</div> : null}
        {items.map((m) => (
          <div key={m.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm gap-3">
              <span>{m.label}</span>
              <span className="text-muted-foreground">{m.score}/100</span>
            </div>
            <Progress value={m.score} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreBreakdown({ report }: { report: FeedbackReport }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Detaylı Skor Kırılımı</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <MetricList title="İçerik" items={report.content || []} description="Soruya uygunluk ve cevap netliği." />
        <MetricList title="İletişim" items={report.communication || []} description="Akış, tempo ve anlatım kalitesi." />
      </CardContent>
    </Card>
  );
}
