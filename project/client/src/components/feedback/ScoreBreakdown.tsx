import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackReport } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function MetricList({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant="outline" className="rounded-full">{items.length} metric</Badge>
      </div>
      <div className="mt-3 space-y-3">
        {items.map((m) => (
          <div key={m.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{m.label}</span>
              <span className="text-muted-foreground">{m.score}/100</span>
            </div>
            <Progress value={m.score} />
            {m.detail ? <div className="text-sm text-muted-foreground">{m.detail}</div> : null}
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
        <CardTitle>Detaylı Kırılım</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <MetricList title="İçerik" items={report.content} />
        <MetricList title="İletişim" items={report.communication} />
        <MetricList title="Davranış (kamera)" items={report.behavioral ?? []} />
      </CardContent>
    </Card>
  );
}
