import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "error">("idle");

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }

    init();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Sen (Kamera)</CardTitle>
        <Badge variant="outline" className="rounded-full">
          {status === "ready" ? "Canlı" : status === "error" ? "Engellendi" : "Yükleniyor"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-muted">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {status === "error" && (
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                Kamera açılmadı. Tarayıcı izinlerini kontrol et.
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
