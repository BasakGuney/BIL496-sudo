import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CandidateAnswerAudio, FeedbackReport, SessionConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Volume2, Sparkles, Activity, ShieldAlert, MonitorCheck, Radio } from "lucide-react";
import { VoiceWaveCanvas } from "@/components/interview/VoiceWaveCanvas";
import { AvatarVideo } from "@/components/interview/AvatarVideo";
import { AvaturnAvatar } from "@/components/interview/AvaturnAvatar";
import { connectRealtimeInterview, type InterviewerAudioClip, type TranscriptEntry } from "@/lib/realtimeClient";
import { endSession, uploadCandidateAnswerIncremental } from "@/lib/api";
import { createVisionAnalyzer, type VisionOverlayState } from "@/lib/visionAnalysis";
import { BACKEND_URL } from "@/lib/config";
import { cn } from "@/lib/utils";

const DEFAULT_OVERLAY: VisionOverlayState = {
  supported: false,
  detecting: false,
  hasFace: false,
  faceCount: 0,
  box: null,
  message: "Sistem hazırlanıyor...",
};

export function InterviewPage({
  config,
  sessionId,
  onFinish,
  onReportUpdate,
}: {
  config: SessionConfig;
  sessionId: string;
  onFinish: (report: FeedbackReport) => void;
  onReportUpdate?: (report: FeedbackReport) => void;
}) {
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [errorText, setErrorText] = useState("");
  const [level, setLevel] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishingMessage, setFinishingMessage] = useState("Lütfen bekleyin, raporunuz hazırlanıyor.");
  const [overlay, setOverlay] = useState<VisionOverlayState>(DEFAULT_OVERLAY);
  const [visualMode, setVisualMode] = useState<"avatar" | "avaturn" | "wave">("avatar");
  const [interviewerAudioClip, setInterviewerAudioClip] = useState<InterviewerAudioClip | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const visionAnalyzerRef = useRef(createVisionAnalyzer());
  const aiSpeakingRef = useRef(false);
  const lastVoiceAtRef = useRef(0);

  const connRef = useRef<Awaited<ReturnType<typeof connectRealtimeInterview>> | null>(null);
  const connectingRef = useRef(false);
  const finishingRef = useRef(false);
  const uploadedAnswerKeysRef = useRef<Set<string>>(new Set());

  const supportiveMode = useMemo(() => config.mode === "Supportive", [config.mode]);

  // Media & Vision initialization
  useEffect(() => {
    let cancelled = false;
    const visionAnalyzer = visionAnalyzerRef.current;

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
          await visionAnalyzer.start({
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
          message: "Kamera devre dışı; analitik veriler kısıtlı kalacak.",
        });
      }
    })();

    return () => {
      cancelled = true;
      visionAnalyzer.stop();
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((t) => t.stop());
        camStreamRef.current = null;
      }
    };
  }, [sessionId, supportiveMode]);

  // Realtime Connection initialization
  useEffect(() => {
    if (connectingRef.current) return;
    if (connRef.current) return;

    connectingRef.current = true;
    let raf = 0;
    let mounted = true;

    (async () => {
      try {
        setStatus("connecting");
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
          difficulty: config.difficulty,
          onTranscriptUpdate: (t) => onTranscriptUpdateRef.current?.(t),
          onInterviewerFinished: (t) => onInterviewerFinishedRef.current?.(t),
          onInterviewerAudio: (clip) => setInterviewerAudioClip(clip),
        });

        if (!mounted) {
          conn.close();
          return;
        }

        connRef.current = conn;
        setStatus("connected");

        const buf = new Uint8Array(conn.analyser.fftSize);
        const SPEAKING_THRESHOLD = 0.04;
        const SPEAKING_RELEASE_MS = 850;

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
          const now = performance.now();
          if (lv > SPEAKING_THRESHOLD) {
            lastVoiceAtRef.current = now;
            if (!aiSpeakingRef.current) {
              aiSpeakingRef.current = true;
              setAiSpeaking(true);
            }
          } else if (aiSpeakingRef.current && now - lastVoiceAtRef.current > SPEAKING_RELEASE_MS) {
            aiSpeakingRef.current = false;
            setAiSpeaking(false);
          }

          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
      } catch (error: unknown) {
        setStatus("error");
        setErrorText(error instanceof Error ? error.message : "Bağlantı kurulamadı.");
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

  const flushIncrementalAnswers = useCallback(async () => {
    const conn = connRef.current;
    if (!conn?.getCandidateAnswerAudios) return;
    const audios = (await conn.getCandidateAnswerAudios(false)) as CandidateAnswerAudio[];
    for (const answer of audios) {
      const key = [Number(answer?.questionIndex || 0), Number(answer?.startedAt || 0), Number(answer?.endedAt || 0)].join(":");
      if (uploadedAnswerKeysRef.current.has(key)) continue;
      await uploadCandidateAnswerIncremental(sessionId, answer);
      uploadedAnswerKeysRef.current.add(key);
    }
  }, [sessionId]);

  useEffect(() => {
    if (status !== "connected") return;
    const intervalId = window.setInterval(() => {
      if (!finishingRef.current) flushIncrementalAnswers().catch(() => {});
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [flushIncrementalAnswers, status]);

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    setFinishingMessage("Analiz verileri toplanıyor...");
    await new Promise((resolve) => setTimeout(resolve, 800));
    await flushIncrementalAnswers().catch(() => {});
    setFinishingMessage("Rapor oluşturuluyor...");

    const transcript = connRef.current?.getTranscript() ?? [];
    let candidateAnswerAudios: CandidateAnswerAudio[] = [];
    if (connRef.current?.getCandidateAnswerAudios) {
      candidateAnswerAudios = await connRef.current.getCandidateAnswerAudios(true);
    }

    connRef.current?.close();
    connRef.current = null;
    visionAnalyzerRef.current.stop();
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }

    const optimisticReport: FeedbackReport = {
      sessionId,
      overallScore: 0,
      notes: ["Analiz devam ediyor..."],
      recommendations: [],
      content: [],
      communication: [],
      behavioral: [],
      transcript,
      transcriptText: transcript.map(i => `[${i.role}] ${i.text}`).join("\n"),
      audioAnalysis: { model: null },
      audioLlmReport: null,
      transcriptAnalysis: null,
      visionLlmAnalysis: null,
      analysisStatus: { audio: false, audioLlm: false, transcript: false, vision: false, visionLlm: false },
    };

    onFinish(optimisticReport);
    try {
      const rep = await endSession(sessionId, transcript, candidateAnswerAudios);
      onReportUpdate?.(rep);
    } catch (e) { console.error(e); }
  }

  // Supportive Mode UI States
  const [hints, setHints] = useState<{id: string, text: string, active: boolean}[]>([]);
  const [toasts, setToasts] = useState<{id: number, type: string, icon: string, title: string, text: string, visible: boolean}[]>([]);
  const lastEvaluatedAnswerTsRef = useRef<number>(0);
  const hintsTimeoutRef = useRef<number | null>(null);

  const pushToast = (type: string, icon: string, title: string, text: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, icon, title, text, visible: false }]);
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t)), 50);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 510);
    }, 5000);
  };
  const onTranscriptUpdateRef = useRef<((t: TranscriptEntry[]) => void) | undefined>(undefined);
  const onInterviewerFinishedRef = useRef<((text: string) => void) | undefined>(undefined);

  useEffect(() => {
    onTranscriptUpdateRef.current = async (transcript: TranscriptEntry[]) => {
      if (!supportiveMode || transcript.length < 2) return;
      const last = transcript[transcript.length - 1];
      const prev = transcript[transcript.length - 2];
      if (last.role === "interviewer" && prev.role === "candidate") {
        if (lastEvaluatedAnswerTsRef.current === prev.ts) return;
        lastEvaluatedAnswerTsRef.current = prev.ts;
        let questionText = "";
        for (let i = transcript.length - 3; i >= 0; i--) {
          if (transcript[i].role === "interviewer") {
            questionText = transcript[i].text;
            break;
          }
        }
        const answerText = prev.text;
        if (!answerText || answerText.length < 5) return;
        try {
          const res = await fetch(`${BACKEND_URL}/session/${sessionId}/supportive/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: questionText, answer: answerText })
          });
          if (res.ok) {
            const { feedback } = await res.json();
            if (feedback?.message) {
              const icon = feedback.type === "success" ? "✓" : "💡";
              pushToast(feedback.type || "info", icon, feedback.title || "Anlık Geri Bildirim", feedback.message);
            }
          }
        } catch (error) {
          console.debug("Supportive feedback request failed", error);
        }
      }
      if (last.role === "candidate") setHints([]);
    };

    onInterviewerFinishedRef.current = async (text: string) => {
      if (!supportiveMode || !text) return;
      try {
        const res = await fetch(`${BACKEND_URL}/session/${sessionId}/supportive/hints`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hints?.length) {
            const nextHints = data.hints
              .slice(0, 3)
              .map((hint: string, index: number) => ({ id: `h-${index}`, text: hint, active: true }));
            setHints(nextHints);
            if (hintsTimeoutRef.current) window.clearTimeout(hintsTimeoutRef.current);
            hintsTimeoutRef.current = window.setTimeout(() => setHints([]), 12000);
          }
        }
      } catch (error) {
        console.debug("Supportive hints request failed", error);
      }
    };
    return () => {
      if (hintsTimeoutRef.current) window.clearTimeout(hintsTimeoutRef.current);
    };
  }, [sessionId, supportiveMode]);

  const needsUserGesture = connRef.current?.audioCtx?.state === "suspended";
  const boxCenterX = overlay.box ? overlay.box.x + overlay.box.width / 2 : 0;
  const boxCenterY = overlay.box ? overlay.box.y + overlay.box.height / 2 : 0;
  const frameWidth = Math.max(overlay.imageWidth || 0, 1);
  const frameHeight = Math.max(overlay.imageHeight || 0, 1);
  const dx = Math.abs((boxCenterX / frameWidth) - 0.5);
  const dy = Math.abs((boxCenterY / frameHeight) - 0.5);
  const isCentered = overlay.hasFace && dx <= 0.14 && dy <= 0.16;
  const guideTone = isCentered ? "green" : "red";
  const framingGuideClass = guideTone === "green"
    ? "border-emerald-400/80 shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_0_16px_rgba(16,185,129,0.2)]"
    : "border-red-400/80 shadow-[0_0_0_1px_rgba(248,113,113,0.35),0_0_16px_rgba(248,113,113,0.2)]";
  const pipStatusClass = guideTone === "green" ? "text-emerald-400" : "text-red-400";
  const pipStatusText = !overlay.hasFace
    ? "Yüz algılanmadı"
    : guideTone === "green"
      ? `${Math.max(overlay.faceCount || 1, 1)} yüz algılandı · Kadraj uygun`
      : `${Math.max(overlay.faceCount || 1, 1)} yüz algılandı · Kadrajı ortala`;
  const speakingStatusText = aiSpeaking ? "AI konuşuyor" : "Sıra sende konuşabilirsin";
  const frameBox = (() => {
    if (!overlay.box || !overlay.imageWidth || !overlay.imageHeight) return null;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const margin = 1.5;
    const videoEl = videoRef.current;
    const containerWidth = Math.max(videoEl?.clientWidth || 0, 1);
    const containerHeight = Math.max(videoEl?.clientHeight || 0, 1);
    const sourceWidth = Math.max(overlay.imageWidth, 1);
    const sourceHeight = Math.max(overlay.imageHeight, 1);
    const paddingX = Math.max(overlay.box.width * 0.14, overlay.imageWidth * 0.018);
    const paddingY = Math.max(overlay.box.height * 0.18, overlay.imageHeight * 0.024);
    const sourceLeft = overlay.box.x - paddingX;
    const sourceTop = overlay.box.y - paddingY;
    const sourceBoxWidth = overlay.box.width + paddingX * 2;
    const sourceBoxHeight = overlay.box.height + paddingY * 2;

    const scale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const cropLeft = (renderedWidth - containerWidth) / 2;
    const cropTop = (renderedHeight - containerHeight) / 2;

    const projectedLeft = ((sourceLeft * scale) - cropLeft) / containerWidth * 100;
    const projectedTop = ((sourceTop * scale) - cropTop) / containerHeight * 100;
    const rawWidth = sourceBoxWidth * scale / containerWidth * 100;
    const rawHeight = sourceBoxHeight * scale / containerHeight * 100;
    const width = clamp(rawWidth, 14, 72);
    const height = clamp(rawHeight, 18, 82);
    const left = clamp(projectedLeft, margin, 100 - margin - width);
    const top = clamp(projectedTop, margin, 100 - margin - height);
    return { left, top, width, height };
  })();

  return (
    <div className="relative h-screen w-full bg-[#05060f] overflow-hidden flex flex-col">
      {/* Immersive Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-enterprise-accent/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Top Bar */}
      <div className="relative z-50 flex items-center justify-between px-8 h-20 bg-gradient-to-b from-black/40 to-transparent">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Live Session</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-enterprise-surface border border-enterprise-border">
            <Activity className="w-3.5 h-3.5 text-enterprise-accent" />
            <span className="text-[10px] font-bold text-enterprise-text-2 uppercase tracking-widest">{config.mode} Mode</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-xl h-10 px-6 text-xs font-bold transition-all shadow-[0_4px_12px_rgba(239,68,68,0.1)]"
            onClick={finish}
            disabled={isFinishing}
          >
            <Flag className="w-4 h-4 mr-2" />
            Mülakatı Bitir
          </Button>
        </div>
      </div>

      {/* Main Stage */}
      <div className="flex-1 relative flex flex-col items-center justify-center px-8 pb-20">
        <div className="w-full max-w-[1000px] space-y-8">
          <div className="relative flex flex-col items-center gap-5">
            <div className="absolute -top-12 flex items-center gap-2 px-3 py-1 rounded-full bg-enterprise-surface-2 border border-enterprise-border text-[9px] font-bold text-enterprise-text-3 uppercase tracking-tighter shadow-xl">
              <Sparkles className="w-3 h-3 text-enterprise-accent" />
              Sesli Etkileşim Aktif
            </div>

            <div className="text-center space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-enterprise-text-3">Yapay Zeka Mülakatçı</div>
              <h2 className="text-[32px] md:text-[36px] font-extrabold tracking-tight text-white">
                {speakingStatusText}
              </h2>
              <p className="text-sm text-enterprise-text-3">
                {aiSpeaking ? "AI yanıt veriyor..." : "AI yanıtı bekleniyor..."}
              </p>
            </div>

            <div className="flex items-center gap-1.5 p-1 rounded-full bg-enterprise-surface-2 border border-enterprise-border">
              <button
                onClick={() => setVisualMode("avatar")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                  visualMode === "avatar" ? "bg-enterprise-accent text-white shadow-lg" : "text-enterprise-text-3 hover:text-white"
                )}
              >
                Avatar
              </button>
              <button
                onClick={() => setVisualMode("avaturn")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                  visualMode === "avaturn" ? "bg-enterprise-accent text-white shadow-lg" : "text-enterprise-text-3 hover:text-white"
                )}
              >
                Human
              </button>
              <button
                onClick={() => setVisualMode("wave")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                  visualMode === "wave" ? "bg-enterprise-accent text-white shadow-lg" : "text-enterprise-text-3 hover:text-white"
                )}
              >
                Ses Dalgası
              </button>
            </div>

            <div className={cn(
              "w-[760px] h-[360px] rounded-[36px] border border-enterprise-border bg-enterprise-surface/30 backdrop-blur-xl relative overflow-hidden transition-all duration-700 shadow-2xl",
              aiSpeaking && "ring-2 ring-enterprise-accent/30"
            )}>
              {isFinishing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-enterprise-bg/90 z-50">
                  <div className="w-12 h-12 border-4 border-enterprise-accent/20 border-t-enterprise-accent rounded-full animate-spin mb-4" />
                  <p className="text-sm font-bold text-white uppercase tracking-widest">{finishingMessage}</p>
                </div>
              ) : (
                <div className="w-full h-full relative">
                  {visualMode === "avatar" ? (
                    <AvatarVideo speaking={aiSpeaking} />
                  ) : visualMode === "avaturn" ? (
                    <AvaturnAvatar speaking={aiSpeaking} level={level} audioClip={interviewerAudioClip} />
                  ) : (
                    <VoiceWaveCanvas speaking={aiSpeaking} level={level} />
                  )}
                </div>
              )}
            </div>

            {/* Status indicator below avatar */}
            <div className="mt-2 flex flex-col items-center gap-3">
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-enterprise-surface-2 border border-enterprise-border shadow-lg">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  aiSpeaking ? "bg-enterprise-accent" : "bg-emerald-500"
                )} />
                <span className="text-xs font-bold text-white uppercase tracking-widest">
                  {speakingStatusText}
                </span>
              </div>
              
              {supportiveMode && hints.length > 0 && (
                <div className="mt-1 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-enterprise-accent">
                    Değinmen Gereken Konular
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {hints.map((h) => (
                      <Badge key={h.id} className="bg-emerald-500/10 border-emerald-400/30 text-emerald-300 text-[11px] px-3 py-1 rounded-full font-medium">
                        {h.text}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating overlays */}
      <div className="absolute bottom-8 left-8 z-40 pointer-events-none">
        <div className="pointer-events-auto mb-3">
          {status === "error" && (
            <div className="p-4 rounded-2xl bg-red-900/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-3">
              <ShieldAlert className="w-5 h-5" />
              {errorText}
            </div>
          )}
          {needsUserGesture && (
            <Button className="bg-enterprise-accent hover:bg-enterprise-accent-2 text-white font-bold rounded-xl h-12 shadow-2xl" onClick={async () => {
              const c = connRef.current;
              if (c) {
                if (c.audioCtx.state === 'suspended') await c.audioCtx.resume();
                await c.audioEl.play();
              }
            }}>
              <Volume2 className="w-4 h-4 mr-2" />
              Sesi Etkinleştir
            </Button>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 right-8 z-30 pointer-events-none">
        <div className="pointer-events-auto relative">
          <div className="w-[240px] md:w-[300px] aspect-video bg-black rounded-[22px] border border-enterprise-border overflow-hidden shadow-2xl">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover mirror" />
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/45 backdrop-blur border border-white/10">
              <div className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]", guideTone === "green" ? "bg-emerald-500" : "bg-red-500")} />
              <span className="text-[9px] font-bold text-white uppercase tracking-tighter">Aday Kamerası</span>
            </div>
            {supportiveMode && frameBox && (
              <div
                className={cn("absolute rounded-2xl border-2 transition-all duration-300", framingGuideClass)}
                style={{
                  left: `${frameBox.left}%`,
                  top: `${frameBox.top}%`,
                  width: `${frameBox.width}%`,
                  height: `${frameBox.height}%`,
                }}
              />
            )}
            {supportiveMode && !frameBox && (
              <div className={cn("absolute left-1/2 top-1/2 w-[42%] h-[58%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 transition-colors duration-300", framingGuideClass)} />
            )}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur text-[8px] font-medium text-white/70">
                <MonitorCheck className="w-2.5 h-2.5" />
                <span className={pipStatusClass}>{pipStatusText}</span>
              </div>
            </div>
            {supportiveMode && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="absolute top-[72px] right-5 z-[100] flex flex-col gap-3 w-[320px] pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={cn(
            "px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-500 flex gap-3",
            t.visible ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0",
            t.type === "success" ? "bg-emerald-950/75 border-emerald-500/35 text-emerald-100" : "bg-blue-950/80 border-blue-500/35 text-blue-100"
          )}>
            <div className={cn(
              "w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-bold",
              t.type === "success" ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-300" : "bg-blue-500/10 border-blue-400/30 text-blue-200"
            )}>
              {t.icon}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[13px] font-semibold">{t.title}</div>
              <div className="text-[11px] opacity-80 leading-relaxed">{t.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
