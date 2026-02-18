import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SessionConfig } from "@/lib/types";
import { formatTime } from "@/lib/utils";

export function InterviewHUD({
  config,
  recording,
  elapsedSec,
}: {
  config: SessionConfig;
  recording: "idle" | "recording" | "paused";
  elapsedSec: number;
}) {
  // 12 dakika hedef (görsel referans). İstersen 10–15 aralığına göre dinamik yaparsın.
  const targetSec = 12 * 60;
  const pct = Math.min(100, Math.round((elapsedSec / targetSec) * 100));

  return (
    <div className="rounded-2xl border p-4 md:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full">{config.interviewType}</Badge>
          <Badge variant="outline" className="rounded-full">{config.difficulty}</Badge>
          <Badge variant="outline" className="rounded-full">{config.mode}</Badge>
          <Badge variant="secondary" className="rounded-full">{config.role}</Badge>
        </div>

        <Badge variant={recording === "recording" ? "destructive" : "outline"} className="rounded-full">
          {recording === "recording" ? "Kayıt" : recording === "paused" ? "Duraklatıldı" : "Hazır"}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Süre</span>
          <span className="font-medium">{formatTime(elapsedSec)} / {formatTime(targetSec)}</span>
        </div>
        <Progress value={pct} />
        <p className="text-sm text-muted-foreground">
          Zaman sınırı müdahalesi her modda uygulanır (cevap uzarsa “özetle ve ana noktaya dön” uyarısı). 
        </p>
      </div>
    </div>
  );
}
