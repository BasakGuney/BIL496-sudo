import React, { useEffect, useRef, useState } from "react";
import type { SessionConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flag, Mic, Volume2 } from "lucide-react";
import { VoiceWaveCanvas } from "@/components/interview/VoiceWaveCanvas";
import { connectRealtimeInterview } from "@/lib/realtimeClient";
import { endSession } from "@/lib/mockApi";

const BACKEND_URL = "http://localhost:3001";

export function InterviewPage({
  config,
  sessionId,
  onFinish,
  onBack,
}: {
  config: SessionConfig;
  sessionId: string;
  onFinish: (report: any) => void;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting"
  );
  const [errorText, setErrorText] = useState("");
  const [level, setLevel] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  const connRef = useRef<Awaited<ReturnType<typeof connectRealtimeInterview>> | null>(null);
  const connectingRef = useRef(false); // ✅ double connect guard

  // Kamera PiP
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        camStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((t) => t.stop());
        camStreamRef.current = null;
      }
    };
  }, []);

  // Realtime connect (✅ sadece 1 kere)
  useEffect(() => {
    if (connectingRef.current) return;
    if (connRef.current) return;

    connectingRef.current = true;
    let raf = 0;
    let mounted = true;

    (async () => {
      try {
        setStatus("connecting");
        setErrorText("");

        const conn = await connectRealtimeInterview({
          backendBaseUrl: BACKEND_URL,
          sessionId,
          mode: config.mode,
          interviewType: config.interviewType,
          firstName: config.firstName,
          lastName: config.lastName,
          gender: config.gender,
          role: config.role,
          companyOrIndustry: config.companyOrIndustry,
          domainInterest: config.domainInterest,
        });

        if (!mounted) {
          conn.close();
          return;
        }

        connRef.current = conn;
        setStatus("connected");

        const buf = new Uint8Array(conn.analyser.fftSize);

        const tick = () => {
          if (!mounted || !connRef.current) return;
          conn.analyser.getByteTimeDomainData(buf);

          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          const lv = Math.min(1, rms * 3.5);
          setLevel(lv);
          setAiSpeaking(lv > 0.04);

          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
      } catch (e: any) {
        console.error(e);
        setStatus("error");
        setErrorText(e?.message || "Unknown error");
      } finally {
        connectingRef.current = false;
      }
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);

      // ✅ cleanup kesin kapat
      connRef.current?.close();
      connRef.current = null;
      connectingRef.current = false;
    };
  }, [config.mode]);

  async function enableAudio() {
    const conn = connRef.current;
    if (!conn) return;
    try {
      if (conn.audioCtx.state !== "running") await conn.audioCtx.resume();
      await conn.audioEl.play();
    } catch (e) {
      console.error("enableAudio failed", e);
    }
  }

  function stopMedia() {
    // ✅ mikrofon + webrtc kapat
    connRef.current?.close();
    connRef.current = null;
    connectingRef.current = false;

    // ✅ kamera kapat
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function finish() {
    const transcript = connRef.current?.getTranscript() || [];
    stopMedia();
    const rep = await endSession(sessionId, transcript);
    onFinish(rep);
  }

  function goBack() {
    stopMedia();
    onBack();
  }

  const needsUserGesture = connRef.current?.audioCtx?.state === "suspended";

  return (
    <div className="relative min-h-[calc(100vh-56px)] w-full overflow-hidden rounded-2xl border">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1020] via-[#11153A] to-[#090A16]" />

      <div className="relative z-10 flex items-center justify-between gap-3 p-4 md:p-5">
        <Button variant="outline" className="rounded-xl" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Geri
        </Button>

        <div className="flex items-center gap-2 rounded-full border bg-background/10 px-4 py-2 text-sm text-white/80 backdrop-blur">
          <Mic className="h-4 w-4" />
          <span>
            {config.mode} • {status === "connected" ? "Live" : status}
          </span>
        </div>

        <Button variant="outline" className="rounded-xl" onClick={finish}>
          <Flag className="mr-2 h-4 w-4" /> Bitir
        </Button>
      </div>

      <div className="relative z-10 grid h-[calc(100vh-56px-84px)] place-items-center px-4">
        <div className="w-full max-w-[980px]">
          <div className="mb-4 text-center">
            <div className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
              AI Interviewer
            </div>
            <div className="mt-2 text-white/70">
              {status === "connected"
                ? aiSpeaking
                  ? "AI konuşuyor..."
                  : "Sıra sende — konuş."
                : status === "connecting"
                ? "Bağlanıyor..."
                : "Bağlantı hatası"}
            </div>
          </div>

          <div className="h-[300px] md:h-[360px] w-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-4">
            <VoiceWaveCanvas speaking={aiSpeaking} level={level} />
          </div>

          {needsUserGesture && (
            <div className="mt-4 flex justify-center">
              <Button className="rounded-xl" onClick={enableAudio}>
                <Volume2 className="mr-2 h-4 w-4" /> Sesi Etkinleştir
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="mt-4 text-center text-sm text-red-200">
              {errorText}
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20 w-[220px] md:w-[260px] overflow-hidden rounded-2xl border border-white/15 bg-black/30 backdrop-blur">
        <div className="px-3 py-2 text-xs text-white/70">Sen (Kamera)</div>
        <div className="aspect-video w-full bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
