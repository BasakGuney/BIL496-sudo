import { useEffect, useMemo, useRef, useState } from "react";
import type { CandidateAnswerAudio, SessionConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flag, Mic, ScanFace, Volume2 } from "lucide-react";
import { VoiceWaveCanvas } from "@/components/interview/VoiceWaveCanvas";
import { connectRealtimeInterview } from "@/lib/realtimeClient";
import { endSession, uploadCandidateAnswerIncremental } from "@/lib/api";
import { createVisionAnalyzer, type VisionOverlayState } from "@/lib/visionAnalysis";

const BACKEND_URL = "http://localhost:3001";

const DEFAULT_OVERLAY: VisionOverlayState = {
  supported: false,
  detecting: false,
  hasFace: false,
  faceCount: 0,
  box: null,
  message: "Görüntü analizi hazırlanıyor...",
};

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
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [errorText, setErrorText] = useState("");
  const [level, setLevel] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishingMessage, setFinishingMessage] = useState("Lütfen bekleyin, raporunuz hazırlanıyor.");
  const [overlay, setOverlay] = useState<VisionOverlayState>(DEFAULT_OVERLAY);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const visionAnalyzerRef = useRef(createVisionAnalyzer());

  const connRef = useRef<Awaited<ReturnType<typeof connectRealtimeInterview>> | null>(null);
  const connectingRef = useRef(false);
  const finishingRef = useRef(false);
  const uploadedAnswerKeysRef = useRef<Set<string>>(new Set());

  const supportiveMode = useMemo(() => config.mode === "Supportive", [config.mode]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        camStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          await visionAnalyzerRef.current.start({
            video: videoRef.current,
            sessionId,
            backendBaseUrl: BACKEND_URL,
            supportiveMode,
            onOverlay: setOverlay,
          });
        }
      } catch (e) {
        console.error(e);
        setOverlay({
          ...DEFAULT_OVERLAY,
          message: "Kamera açılamadı; görüntü analizi devre dışı kalacak.",
        });
      }
    })();

    return () => {
      cancelled = true;
      visionAnalyzerRef.current.stop();
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((t) => t.stop());
        camStreamRef.current = null;
      }
    };
  }, [supportiveMode]);

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
          onTranscriptUpdate: (t) => onTranscriptUpdateRef.current?.(t),
          onInterviewerFinished: (t) => onInterviewerFinishedRef.current?.(t),
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
        setErrorText(e?.message || "Bilinmeyen hata");
      } finally {
        connectingRef.current = false;
      }
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      if (!finishingRef.current) {
        connRef.current?.close();
        connRef.current = null;
        connectingRef.current = false;
      }
    };
  }, [config, sessionId]);

  function buildAnswerUploadKey(answer: Partial<CandidateAnswerAudio>) {
    return [Number(answer?.questionIndex || 0), Number(answer?.startedAt || 0), Number(answer?.endedAt || 0)].join(":");
  }

  async function flushIncrementalAnswers() {
    const conn = connRef.current;
    if (!conn?.getCandidateAnswerAudios) return;

    const audios = (await conn.getCandidateAnswerAudios(false)) as CandidateAnswerAudio[];
    for (const answer of audios) {
      const key = buildAnswerUploadKey(answer);
      if (uploadedAnswerKeysRef.current.has(key)) continue;

      await uploadCandidateAnswerIncremental(sessionId, answer);
      uploadedAnswerKeysRef.current.add(key);
    }
  }

  useEffect(() => {
    if (status !== "connected") return;

    const intervalId = window.setInterval(() => {
      if (finishingRef.current) return;

      flushIncrementalAnswers().catch((error) => {
        console.error("incremental answer upload failed", error);
      });
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [sessionId, status]);

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
    connRef.current?.close();
    connRef.current = null;
    connectingRef.current = false;

    visionAnalyzerRef.current.stop();
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    setFinishingMessage("Ses, transcript ve görüntü verileri toplanıyor...");

    await new Promise((resolve) => setTimeout(resolve, 900));

    await flushIncrementalAnswers().catch((error) => {
      console.error("final incremental flush failed", error);
    });
    setFinishingMessage("Oturum kapatılıyor ve ilk rapor oluşturuluyor...");

    const transcript = connRef.current?.getTranscript() || [];
    let candidateAnswerAudios: any[] = [];
    if (connRef.current?.getCandidateAnswerAudios) {
      candidateAnswerAudios = await connRef.current.getCandidateAnswerAudios(true);
    }

    stopMedia();
    const rep = await endSession(sessionId, transcript, candidateAnswerAudios);
    setFinishingMessage("Analiz raporları hazırlanıyor; lütfen sayfada kalın...");

    try {
      onFinish(rep);
    } catch (error) {
      console.error("transition to ready report failed", error);
      onFinish(rep);
    }
  }

  function goBack() {
    stopMedia();
    onBack();
  }

  // Supportive Mode UI States
  const [hints, setHints] = useState<{id: string, text: string, active: boolean}[]>([]);
  const [toasts, setToasts] = useState<{id: number, type: "success"|"info"|"warning", icon: string, title: string, text: string, visible: boolean}[]>([]);
  
  // Ref to track last evaluated answer to avoid spam
  const lastEvaluatedAnswerTsRef = useRef<number>(0);

  const pushToast = (type: "success"|"info"|"warning", icon: string, title: string, text: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, icon, title, text, visible: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t));
    }, 50);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 500);
    }, 5000);
  };

  // Ref for transcript update to avoid stale closures in RTC callback
  const onTranscriptUpdateRef = useRef<((transcript: any[]) => void) | undefined>(undefined);
  const onInterviewerFinishedRef = useRef<((text: string) => void) | undefined>(undefined);

  useEffect(() => {
    onTranscriptUpdateRef.current = async (transcript: any[]) => {
      if (!supportiveMode || transcript.length < 2) return;
      
      // When AI starts talking (role === interviewer), candidate turn is over.
      const lastMsg = transcript[transcript.length - 1];
      const prevMsg = transcript[transcript.length - 2];
      
      if (lastMsg.role === "interviewer" && prevMsg.role === "candidate") {
        if (lastEvaluatedAnswerTsRef.current === prevMsg.ts) return; 
        lastEvaluatedAnswerTsRef.current = prevMsg.ts;
        
        let questionText = "Bize kendinden bahseder misin?";
        for (let i = transcript.length - 3; i >= 0; i--) {
          if (transcript[i].role === "interviewer") {
            questionText = transcript[i].text;
            break;
          }
        }
        
        const answerText = prevMsg.text;
        if (!answerText || answerText.length < 5) return; 
        
        try {
          const res = await fetch(`${BACKEND_URL}/session/${sessionId}/supportive/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: questionText, answer: answerText })
          });
          if (res.ok) {
            const { feedback } = await res.json();
            if (feedback && feedback.message) {
              pushToast(feedback.type || "info", feedback.type === "success" ? "✅" : "💡", feedback.title || "Geri Bildirim", feedback.message);
            }
          }
        } catch (e) {
          console.error("Supportive feedback fetch failed", e);
        }
      }
      
      // Aday konuşmaya başladığında veya 8 saniye sonra ipuçlarını temizle
      if (lastMsg.role === "candidate" && hints.length > 0) {
         setHints([]);
      }
    };

    onInterviewerFinishedRef.current = async (text: string) => {
      if (!supportiveMode || !text) return;
      try {
        const res = await fetch(`${BACKEND_URL}/session/${sessionId}/supportive/hints`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hints && Array.isArray(data.hints) && data.hints.length > 0) {
            setHints(data.hints.slice(0, 3).map((h: string, i: number) => ({ 
              id: `hint-dyn-${Date.now()}-${i}`, 
              text: h, 
              active: true 
            })));
            setTimeout(() => setHints([]), 8000); // 8 saniye sonra temizle
          }
        }
      } catch (e) {
        console.error("Supportive hints fetch failed", e);
      }
    };
  });

  const overlayToneClass = overlay.attentionLevel === "danger"
    ? "border-red-400 shadow-[0_0_0_9999px_rgba(127,29,29,0.18)]"
    : overlay.attentionLevel === "warn"
      ? "border-yellow-300 shadow-[0_0_0_9999px_rgba(120,53,15,0.16)]"
      : "border-emerald-400 shadow-[0_0_0_9999px_rgba(16,24,40,0.08)]";

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
            {config.mode} • {status === "connected" ? "Canlı" : status === "connecting" ? "Bağlanıyor" : "Hata"}
          </span>
        </div>

        <Button variant="outline" className="rounded-xl" onClick={finish}>
          <Flag className="mr-2 h-4 w-4" /> Bitir
        </Button>
      </div>

      <div className="relative z-10 grid h-[calc(100vh-56px-84px)] place-items-center px-4">
        <div className="w-full max-w-[980px]">
          <div className="mb-4 text-center">
            <div className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Yapay Zeka Mülakatçı</div>
            <div className="mt-2 text-white/70">
              {status === "connected"
                ? aiSpeaking
                  ? "AI konuşuyor..."
                  : "Sıra sende — konuş."
                : status === "connecting"
                  ? "Bağlanıyor..."
                  : "Bağlantı hatası"}
            </div>
            
            {supportiveMode && hints.length > 0 && (
              <div className="mt-6 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="text-xs font-medium text-blue-300 uppercase tracking-widest">💡 Değinmen Gereken Konular</div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {hints.map(hint => (
                    <div 
                      key={hint.id} 
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-500 ${hint.active ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-white/60'}`}
                    >
                      {hint.active ? "✅ " : "# "}{hint.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 pb-4 text-xs text-white/70">
            <ScanFace className={`h-4 w-4 ${overlay.attentionLevel === "danger" ? "text-red-300" : overlay.attentionLevel === "warn" ? "text-yellow-200" : "text-emerald-300"}`} />
            <span>{overlay.message}</span>
          </div>

          <div className="flex h-[300px] w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur md:h-[360px]">
            {isFinishing ? (
              <div className="animate-in fade-in flex flex-col items-center gap-4 duration-500">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                <div className="text-xl font-medium text-white/90">Mülakat Bitiriliyor...</div>
                <div className="text-sm text-white/50">{finishingMessage}</div>
              </div>
            ) : (
              <VoiceWaveCanvas speaking={aiSpeaking} level={level} />
            )}
          </div>

          {needsUserGesture && (
            <div className="mt-4 flex justify-center">
              <Button className="rounded-xl" onClick={enableAudio}>
                <Volume2 className="mr-2 h-4 w-4" /> Sesi Etkinleştir
              </Button>
            </div>
          )}

          {status === "error" && <div className="mt-4 text-center text-sm text-red-200">{errorText}</div>}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20 w-[220px] overflow-hidden rounded-2xl border border-white/15 bg-black/30 backdrop-blur md:w-[260px]">
        <div className="flex items-center justify-between px-3 py-2 text-xs text-white/70">
          <span>Sen (Kamera)</span>
          <span>{overlay.hasFace ? `${overlay.faceCount || 1} yüz` : 'yüz yok'}</span>
        </div>
        <div className="relative aspect-video w-full bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          {supportiveMode && overlay.box ? (
            <div
              className={`pointer-events-none absolute border-2 ${overlayToneClass}`}
              style={{
                left: `${(overlay.box.x / Math.max(overlay.imageWidth || videoRef.current?.videoWidth || 1, 1)) * 100}%`,
                top: `${(overlay.box.y / Math.max(overlay.imageHeight || videoRef.current?.videoHeight || 1, 1)) * 100}%`,
                width: `${(overlay.box.width / Math.max(overlay.imageWidth || videoRef.current?.videoWidth || 1, 1)) * 100}%`,
                height: `${(overlay.box.height / Math.max(overlay.imageHeight || videoRef.current?.videoHeight || 1, 1)) * 100}%`,
              }}
            />
          ) : null}
        </div>
        <div className="border-t border-white/10 px-3 py-2 text-[11px] text-white/60">
          {supportiveMode
            ? 'Supportive modda yüz çerçevesi ve kadraj desteği aktif.'
            : 'Neutral modda yalnızca arka planda görüntü analizi toplanır.'}
        </div>
      </div>

      {/* Live Supportive Toasts */}
      {supportiveMode && (
        <div className="absolute top-6 right-6 z-50 flex flex-col gap-3 w-80 pointer-events-none">
          {toasts.map(toast => (
            <div 
              key={toast.id}
              className={`p-4 rounded-xl border flex gap-3 shadow-2xl transition-all duration-500 transform ${toast.visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} ${
                toast.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-100' :
                toast.type === 'warning' ? 'bg-amber-950/80 border-amber-500/50 text-amber-100' :
                'bg-blue-950/80 border-blue-500/50 text-blue-100'
              } backdrop-blur-md`}
            >
              <div className="text-xl">{toast.icon}</div>
              <div className="flex flex-col gap-1">
                <div className="font-semibold text-sm">{toast.title}</div>
                <div className="text-xs opacity-80 leading-snug">{toast.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
