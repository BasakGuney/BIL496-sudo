import { Button } from "@/components/ui/button";
import { Play, Pause, StopCircle } from "lucide-react";

export function VoiceControls({
  recording,
  onChange,
}: {
  recording: "idle" | "recording" | "paused";
  onChange: (v: "idle" | "recording" | "paused") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="rounded-xl" onClick={() => onChange("recording")} disabled={recording === "recording"}>
        <Play className="mr-2 h-4 w-4" /> Başlat
      </Button>
      <Button variant="outline" className="rounded-xl" onClick={() => onChange("paused")} disabled={recording !== "recording"}>
        <Pause className="mr-2 h-4 w-4" /> Duraklat
      </Button>
      <Button variant="outline" className="rounded-xl" onClick={() => onChange("idle")} disabled={recording === "idle"}>
        <StopCircle className="mr-2 h-4 w-4" /> Durdur
      </Button>
    </div>
  );
}
