import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AISpeakerPanel({
  speaking,
  text,
}: {
  speaking: boolean;
  text: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>AI Konuşuyor</CardTitle>
        <Badge variant={speaking ? "destructive" : "outline"} className="rounded-full">
          {speaking ? "Konuşuyor" : "Beklemede"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Soru / yönlendirme</p>
          <p className="mt-2 text-base">{text}</p>
        </div>

        <div className="rounded-2xl border p-4">
          <p className="text-sm font-medium">Ses göstergesi</p>
          <div className="mt-2 flex items-end gap-1">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className={"w-2 rounded-full bg-foreground/20 " + (speaking ? "animate-pulse" : "")}
                style={{ height: 10 + (i % 6) * 6 }}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Burayı TTS state + audio player ile bağlayabilirsin.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
