import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FeedbackReport } from "@/lib/types";

export function FeedbackSummary({ report }: { report: FeedbackReport }) {
  const scoreMeta = report.scoreMeta;
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{scoreMeta?.overall?.label || "Özet Skor"}</CardTitle>
        <Badge variant="outline" className="rounded-full">{report.overallScore}/{scoreMeta?.overall?.max || 100}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={report.overallScore} />
        <div className="rounded-2xl border p-4 space-y-2 text-sm text-muted-foreground">
          <p>• Genel skor ölçeği: {scoreMeta?.overall?.min || 0}-{scoreMeta?.overall?.max || 100}</p>
          <p>• Audio skorları netlik/duygu sinyallerinden, vision skorları yüz görünürlüğü-kadraj-stabilite-risk sinyallerinden üretilir.</p>
          <p>• Yüksek genel/audio/vision odak skorları iyi; yüksek risk/gerginlik skorları ise olumsuz sinyaldir.</p>
        </div>

        {report.notes?.length ? (
          <div className="rounded-2xl border p-4">
            <p className="text-sm font-medium">Notlar</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {report.notes.map((n, i) => <li key={i}>• {n}</li>)}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
