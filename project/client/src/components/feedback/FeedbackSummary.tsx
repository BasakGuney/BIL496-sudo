import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FeedbackReport } from "@/lib/types";

export function FeedbackSummary({ report }: { report: FeedbackReport }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Özet Skor</CardTitle>
        <Badge variant="outline" className="rounded-full">{report.overallScore}/100</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={report.overallScore} />
        <div className="rounded-2xl border p-4">
          <p className="text-sm font-medium">Açıklama</p>
          <p className="text-sm text-muted-foreground mt-1">
            Skor; içerik kalitesi (ilgili/net/kapsamlı) + iletişim sinyalleri + (onay varsa) kamera tabanlı davranış sinyallerinin birleşimidir.
          </p>
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
