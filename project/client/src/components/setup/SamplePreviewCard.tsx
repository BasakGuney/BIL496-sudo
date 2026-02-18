import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SamplePreviewCard({ question }: { question: string }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Örnek Soru Önizleme</CardTitle>
        <Badge variant="outline" className="rounded-full">Preview</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Bu önizleme beklenti hizalama içindir; mülakatta aynı soru gelmesi garanti değildir.
        </p>
        <div className="mt-3 rounded-2xl border p-4">
          <p className="text-sm font-medium">{question || "Yükleniyor..."}</p>
        </div>
      </CardContent>
    </Card>
  );
}
