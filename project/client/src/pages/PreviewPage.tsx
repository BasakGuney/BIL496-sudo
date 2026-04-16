import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Video, VideoOff, Loader2, Sparkles, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { generatePreviewQuestions, updateSessionConfig } from "@/lib/api";
import type { CandidateBrief, SessionConfig } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_CANDIDATE_BRIEF: CandidateBrief = {
  headline: "",
  summary: "",
  technicalSummary: "",
  hrSummary: "",
  educationHighlights: [],
  experienceHighlights: [],
  projectHighlights: [],
  skillHighlights: [],
  hrExperienceHighlights: [],
  hrFocusHighlights: [],
};

const parseLines = (text: string) =>
  text.split("\n").map((line) => line.trim()).filter(Boolean);

const linesToText = (items: string[] = []) => items.join("\n");

export function PreviewPage({
  config,
  sessionId,
  setConfig,
  onStartInterview,
  onBack,
}: {
  config: SessionConfig;
  sessionId: string | null;
  setConfig: (cfg: SessionConfig) => void;
  onStartInterview: () => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camOn, setCamOn] = useState(false);
  const camStreamRef = useRef<MediaStream | null>(null);

  const [micOn, setMicOn] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const [level, setLevel] = useState(0);

  const [questions, setQuestions] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [startingSession, setStartingSession] = useState(false);

  const canMedia = useMemo(() => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia, []);

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

  const startMic = async () => {
    if (!canMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;
      setMicOn(true);

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        // Increased sensitivity: Normal speech usually has low average frequency energy.
        // Mapping higher range to 0-1.
        setLevel(Math.min(1, avg / 48)); 
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
    setLevel(0);
    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    setMicOn(false);
  };

  useEffect(() => {
    return () => { stopCamera(); stopMic(); };
  }, []);

  const candidateBrief = useMemo(
    () => ({ ...EMPTY_CANDIDATE_BRIEF, ...(config.candidateBrief || {}) }),
    [config.candidateBrief]
  );
  const previewQuestionConfig = useMemo(() => ({ ...config, candidateBrief }), [config, candidateBrief]);

  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;
    async function fetchQuestions() {
      setLoadingQuestions(true);
      try {
        const qs = await generatePreviewQuestions(previewQuestionConfig);
        if (mounted) setQuestions(qs);
      } catch (e) {
        console.error("Failed to generate questions", e);
      } finally {
        if (mounted) setLoadingQuestions(false);
      }
    }
    timer = window.setTimeout(fetchQuestions, 500);
    return () => { mounted = false; if (timer) window.clearTimeout(timer); };
  }, [previewQuestionConfig]);

  const handleStartInterview = async () => {
    stopCamera();
    stopMic();
    setStartingSession(true);
    try {
      if (!sessionId) throw new Error("Oturum bulunamadı.");
      await updateSessionConfig(sessionId, config);
      onStartInterview();
    } catch (e) {
      console.error("Failed to start session", e);
      setStartingSession(false);
    }
  };

  const updateBrief = (patch: Partial<CandidateBrief>) => {
    setConfig({
      ...config,
      candidateBrief: { ...EMPTY_CANDIDATE_BRIEF, ...candidateBrief, ...patch },
    });
  };

  return (
    <div className="max-w-[1280px] mx-auto px-8 py-10">
      <header className="mb-10">
        <h2 className="text-[28px] font-extrabold text-white tracking-tight mb-2">Cihaz Testi</h2>
        <p className="text-sm text-enterprise-text-2">Mülakata başlamadan önce kamera ve mikrofonunuzu kontrol edin.</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_500px]">
        {/* Left: Media Tests */}
        <div className="space-y-8">

          <div className="space-y-6">
            <div className="card-style bg-enterprise-surface/40 p-6 overflow-hidden relative">
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-enterprise-accent/10 flex items-center justify-center border border-enterprise-accent/20">
                    <Video className="w-4 h-4 text-enterprise-accent" />
                  </div>
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Kamera Kontrolü</span>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="rounded-lg h-8 border border-enterprise-border text-enterprise-text-2 hover:text-white"
                  onClick={() => camOn ? stopCamera() : startCamera()}
                >
                  {camOn ? <VideoOff className="w-3.5 h-3.5 mr-2" /> : <Video className="w-3.5 h-3.5 mr-2" />}
                  {camOn ? "Kapat" : "Test Et"}
                </Button>
              </div>

              <div className="aspect-video rounded-2xl bg-enterprise-surface-2 border border-enterprise-border overflow-hidden relative group">
                {!camOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-enterprise-text-3">
                    <Video className="w-12 h-12 mb-3 opacity-20" />
                    <span className="text-xs uppercase font-bold tracking-widest opacity-40">Kamera Kapalı</span>
                  </div>
                )}
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <div className="absolute top-4 left-4 flex gap-2">
                  <Badge className="bg-black/40 backdrop-blur border-none text-[10px] font-bold text-emerald-400">720P HD</Badge>
                  {camOn && <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[10px] font-bold">AKTİF</Badge>}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-enterprise-surface-2/40 border border-enterprise-border">
                <AlertCircle className="w-4 h-4 text-enterprise-accent mt-0.5" />
                <p className="text-[11px] text-enterprise-text-2 leading-relaxed italic">
                  Görüntü kalitesini artırmak için ışığın karşıdan gelmesine dikkat edin.
                </p>
              </div>
            </div>

            <div className="card-style bg-enterprise-surface/40 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <Mic className="w-4 h-4 text-emerald-500" />
                  </div>
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Mikrofon Testi</span>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="rounded-lg h-8 border border-enterprise-border text-enterprise-text-2 hover:text-white"
                  onClick={() => micOn ? stopMic() : startMic()}
                >
                  {micOn ? <MicOff className="w-3.5 h-3.5 mr-2" /> : <Mic className="w-3.5 h-3.5 mr-2" />}
                  {micOn ? "Kapat" : "Test Et"}
                </Button>
              </div>

              <div className="mt-10 px-1">
                <div className="h-3 w-full bg-enterprise-surface-2 rounded-full overflow-hidden relative border border-enterprise-border/50">
                  {/* Real-time Level Bar */}
                  <div 
                    className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                    style={{ width: `${level * 100}%` }}
                  />

                  {/* Ideal Range 'Hatched' Zone (Tarama Efekti) */}
                  <div 
                    className="absolute inset-y-0 left-[40%] right-[20%] z-20 border-x border-enterprise-accent/30"
                    style={{
                      background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(124, 92, 252, 0.15) 4px, rgba(124, 92, 252, 0.15) 8px)'
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="card-style bg-enterprise-surface p-6">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles className="w-5 h-5 text-enterprise-accent" />
                <h3 className="font-bold text-white uppercase tracking-wider text-xs">Mülakat Özeti</h3>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-enterprise-border">
                  <span className="text-xs text-enterprise-text-3 font-semibold uppercase">Rol</span>
                  <span className="text-xs font-bold text-white">{config.role}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-enterprise-border">
                  <span className="text-xs text-enterprise-text-3 font-semibold uppercase">Şirket</span>
                  <span className="text-xs font-bold text-white">{config.companyOrIndustry}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-enterprise-border">
                  <span className="text-xs text-enterprise-text-3 font-semibold uppercase">Tip</span>
                  <Badge className="bg-enterprise-accent/15 border-enterprise-accent/20 text-enterprise-accent-2 text-[10px] uppercase">{config.interviewType === "HR" ? "İnsan Kaynakları" : "Teknik"}</Badge>
                </div>
              </div>

              {config.interviewType === "Technical" && (
                <div className="space-y-2 mt-4 p-3 rounded-xl bg-enterprise-surface-2 border border-enterprise-border">
                  <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">Zorluk Seviyesi</Label>
                  <Select
                    value={config.difficulty}
                    onValueChange={(v) => setConfig({ ...config, difficulty: v as "Junior" | "Intermediate" })}
                  >
                    <SelectTrigger className="h-9 bg-enterprise-surface border-none text-xs rounded-lg ring-0 focus:ring-0">
                      <SelectValue placeholder="Zorluk" />
                    </SelectTrigger>
                    <SelectContent className="bg-enterprise-surface border-enterprise-border text-white">
                      <SelectItem value="Junior">Junior (Başlangıç)</SelectItem>
                      <SelectItem value="Intermediate">Intermediate (Orta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right: Summary & Questions */}
        <div className="space-y-6">
          {/* Soru Önizleme */}
          <div className="card-style bg-enterprise-surface p-6 border-enterprise-accent/30 shadow-[0_0_30px_rgba(124,92,252,0.05)]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-white uppercase tracking-wider text-xs">Soru Önizleme</h3>
              </div>
              {loadingQuestions && <Loader2 className="w-4 h-4 text-enterprise-accent animate-spin" />}
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {loadingQuestions ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 w-full animate-pulse bg-enterprise-surface-2 border border-enterprise-border rounded-xl" />
                ))
              ) : questions.length > 0 ? (
                questions.map((q, i) => (
                  <div key={i} className="p-4 rounded-xl bg-enterprise-surface-2 border border-enterprise-border hover:border-enterprise-accent/30 transition-all">
                    <div className="text-[10px] font-bold text-enterprise-accent uppercase mb-2">Örnek Soru {i + 1}</div>
                    <p className="text-xs text-white leading-relaxed">{q}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-enterprise-text-3 text-xs italic">Sorular yükleniyor...</div>
              )}
            </div>

          </div>

          {/* CV Detayları - Collapsible-like section */}
          {(config.cvFile || config.candidateBrief) && (
            <div className="card-style bg-enterprise-surface p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-enterprise-text-2" />
                  <h3 className="font-bold text-white uppercase tracking-wider text-xs">CV Detayları</h3>
                </div>
              </div>
              
              <div className="space-y-5">
                <div className="grid gap-2">
                  <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">Başlık</Label>
                  <Input
                    className="h-9 bg-enterprise-surface-2 border-enterprise-border rounded-lg text-xs"
                    value={candidateBrief.headline}
                    onChange={(e) => updateBrief({ headline: e.target.value })}
                  />
                </div>
                {config.interviewType === "Technical" ? (
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">Teknik Özet</Label>
                    <Textarea
                      className="bg-enterprise-surface-2 border-enterprise-border rounded-lg text-xs min-h-[80px] resize-none"
                      value={candidateBrief.technicalSummary || candidateBrief.summary}
                      onChange={(e) => updateBrief({ technicalSummary: e.target.value, summary: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">HR Özeti</Label>
                    <Textarea
                      className="bg-enterprise-surface-2 border-enterprise-border rounded-lg text-xs min-h-[80px] resize-none"
                      value={candidateBrief.hrSummary}
                      onChange={(e) => updateBrief({ hrSummary: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">Eğitim</Label>
                    <Textarea className="h-24 bg-enterprise-surface-2 border-enterprise-border text-[10px]" value={linesToText(candidateBrief.educationHighlights)} onChange={(e) => updateBrief({ educationHighlights: parseLines(e.target.value) })} />
                  </div>
                  {config.interviewType === "Technical" ? (
                    <div className="grid gap-2">
                      <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">Teknik Yetenekler</Label>
                      <Textarea className="h-24 bg-enterprise-surface-2 border-enterprise-border text-[10px]" value={linesToText(candidateBrief.skillHighlights)} onChange={(e) => updateBrief({ skillHighlights: parseLines(e.target.value) })} />
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">HR Odakları</Label>
                      <Textarea className="h-24 bg-enterprise-surface-2 border-enterprise-border text-[10px]" value={linesToText(candidateBrief.hrFocusHighlights)} onChange={(e) => updateBrief({ hrFocusHighlights: parseLines(e.target.value) })} />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {config.interviewType === "Technical" ? (
                    <>
                      <div className="grid gap-2">
                        <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">Deneyimler</Label>
                        <Textarea className="h-24 bg-enterprise-surface-2 border-enterprise-border text-[10px]" value={linesToText(candidateBrief.experienceHighlights)} onChange={(e) => updateBrief({ experienceHighlights: parseLines(e.target.value) })} />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">Projeler</Label>
                        <Textarea className="h-24 bg-enterprise-surface-2 border-enterprise-border text-[10px]" value={linesToText(candidateBrief.projectHighlights)} onChange={(e) => updateBrief({ projectHighlights: parseLines(e.target.value) })} />
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-2 col-span-2">
                      <Label className="text-[10px] font-bold text-enterprise-text-3 uppercase">HR Deneyim Başlıkları</Label>
                      <Textarea className="h-24 bg-enterprise-surface-2 border-enterprise-border text-[10px]" value={linesToText(candidateBrief.hrExperienceHighlights)} onChange={(e) => updateBrief({ hrExperienceHighlights: parseLines(e.target.value) })} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 pt-10 border-t border-enterprise-border flex items-center justify-between">
        <Button 
          className="bg-enterprise-surface border border-enterprise-border text-enterprise-text-2 hover:text-white rounded-xl h-12 px-8 text-sm font-semibold transition-all"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Kuruluma Dön
        </Button>

        <Button 
          className="bg-gradient-to-br from-enterprise-accent to-enterprise-accent-2 transition-all text-white font-extrabold rounded-xl h-12 px-8 group shadow-[0_10px_30px_rgba(124,92,252,0.3)] disabled:opacity-50"
          disabled={startingSession || loadingQuestions}
          onClick={handleStartInterview}
        >
          {startingSession ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              HAZIRLANIYOR...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              MÜLAKATA BAŞLA
              <ChevronRight className="w-4 h-4 ml-2" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
