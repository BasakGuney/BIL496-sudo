import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Mic, MicOff, Video, VideoOff } from "lucide-react";

export function PreviewPage({
  sessionId,
  questions,
  onStartInterview,
  onBack,
}: {
  sessionId: string;
  questions: string[];
  onStartInterview: () => void;
  onBack: () => void;
}) {
  // --- Camera preview state ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camOn, setCamOn] = useState(false);
  const camStreamRef = useRef<MediaStream | null>(null);

  // --- Mic preview state ---
  const [micOn, setMicOn] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const [level, setLevel] = useState(0); // 0..1

  const canMedia = useMemo(() => {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }, []);

  // -------- Camera handlers ----------
  const startCamera = async () => {
    if (!canMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      camStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamOn(true);
    } catch (e) {
      console.error("Camera preview error:", e);
      setCamOn(false);
    }
  };

  const stopCamera = () => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  };

  // -------- Mic handlers ----------
  const startMic = async () => {
    if (!canMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      setMicOn(true);

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 2.2));
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.error("Mic preview error:", e);
      setMicOn(false);
    }
  };

  const stopMic = async () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevel(0);

    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }

    setMicOn(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr] lg:min-h-[calc(100vh-80px)]">
      {/* LEFT: Camera + Mic Panels */}
      <div className="space-y-6 lg:space-y-0 lg:gap-6 lg:h-full lg:flex lg:flex-col">
        <Card className="rounded-2xl lg:flex-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Kamera Önizleme</CardTitle>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => (camOn ? stopCamera() : startCamera())}
              disabled={!canMedia}
            >
              {camOn ? (
                <>
                  <VideoOff className="mr-2 h-4 w-4" /> Kapat
                </>
              ) : (
                <>
                  <Video className="mr-2 h-4 w-4" /> Aç
                </>
              )}
            </Button>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="rounded-2xl border overflow-hidden bg-muted/30 aspect-video">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            </div>
            <p className="text-xs text-muted-foreground">
              Işık yüzüne gelsin, kamera göz hizasında olsun. Önizleme sadece kontrol amaçlıdır.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:flex-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Mikrofon Testi</CardTitle>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => (micOn ? stopMic() : startMic())}
              disabled={!canMedia}
            >
              {micOn ? (
                <>
                  <MicOff className="mr-2 h-4 w-4" /> Kapat
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-4 w-4" /> Aç
                </>
              )}
            </Button>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Ses Seviyesi</div>
              <div className="mt-3 h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-100"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Konuşunca bar yükselmeli. Çok düşükse mikrofona yaklaş veya sistem ses ayarını kontrol et.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT: One Card contains (Sample Questions + Tip) stacked */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Soru Önizleme</CardTitle>
          <Badge variant="outline" className="rounded-full">
            {sessionId}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Sample questions section */}
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium">Örnek Sorular (2 adet)</div>
              <div className="text-sm text-muted-foreground">
                Bunlar beklenti hizalamak içindir. Mülakatta birebir aynı soru gelmesi garanti değildir.
              </div>
            </div>

            {questions.slice(0, 2).map((q, i) => (
              <div key={i} className="rounded-2xl border p-4">
                <div className="text-sm font-medium">Örnek Soru {i + 1}</div>
                <div className="mt-2 text-base">{q}</div>
              </div>
            ))}
          </div>

          {/* Tip section */}
          <div className="space-y-2">
            <div className="text-sm font-medium">İpucu</div>
            <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
              1) Cevaba başlamadan 1 saniye durakla <br />
              2) Tek cümle ana mesaj → örnek → sonuç <br />
              3) Supportive modda mini yönlendirmeler alırsın
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" className="rounded-xl" onClick={onBack}>
              Kuruluma dön
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                stopCamera();
                stopMic();
                onStartInterview();
              }}
            >
              <Play className="mr-2 h-4 w-4" /> Mülakata Başla
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
