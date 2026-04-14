import { useEffect, useRef, useState } from "react";
import type { InterviewerAudioClip } from "@/lib/realtimeClient";

type Props = {
  speaking: boolean;
  level?: number;
  audioClip?: InterviewerAudioClip | null;
  className?: string;
};

type TalkingHeadInstance = {
  showAvatar: (config: Record<string, unknown>, onProgress?: (url?: string, event?: ProgressEvent<EventTarget>) => void) => Promise<void>;
  speakAudio?: (audio: Record<string, unknown>, opt?: Record<string, unknown>) => Promise<void>;
  start?: () => void;
  stop?: () => void;
  stopSpeaking?: () => void;
  mtAvatar?: Record<string, { realtime?: number | null; needsUpdate?: boolean } | undefined>;
};

const AVATURN_URL = "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/avatars/avaturn.glb";
const TALKING_HEAD_MODULE_URL = "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/modules/talkinghead.mjs";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothValue(prev: number, next: number, factor = 0.55) {
  return prev * (1 - factor) + next * factor;
}

function buildBlendshapeAnimation(audioBuffer: AudioBuffer, sensitivity = 1.1) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameMs = 33;
  const frameSamples = Math.max(1, Math.floor((sampleRate * frameMs) / 1000));
  const frames = Math.ceil(channelData.length / frameSamples);

  const mouthOpen: number[] = [];
  const mouthFunnel: number[] = [];
  const dt: number[] = [];

  let prevOpening = 0;
  let prevEnergy = 0;
  let prevRounded = 0;

  for (let i = 0; i < frames; i++) {
    const start = i * frameSamples;
    const end = Math.min(start + frameSamples, channelData.length);

    let sumSquares = 0;
    let peak = 0;
    let diffEnergy = 0;
    let zeroCrossings = 0;
    let prevSample = channelData[start] || 0;

    for (let j = start; j < end; j++) {
      const sample = channelData[j];
      const abs = Math.abs(sample);
      sumSquares += abs * abs;
      if (abs > peak) peak = abs;

      if (j > start) {
        const diff = sample - prevSample;
        diffEnergy += diff * diff;
        if ((sample >= 0 && prevSample < 0) || (sample < 0 && prevSample >= 0)) {
          zeroCrossings++;
        }
      }

      prevSample = sample;
    }

    const length = Math.max(1, end - start);
    const rms = Math.sqrt(sumSquares / length);

    const rawEnergy = clamp((rms * 2.1 + peak * 0.55) * sensitivity, 0, 1);
    const gatedEnergy = rawEnergy < 0.07 ? 0 : rawEnergy;
    const emphasis = clamp((gatedEnergy - prevEnergy) * 2.1, 0, 0.14);
    const shapedEnergy = Math.pow(gatedEnergy, 0.9);
    const targetOpening = clamp(shapedEnergy * 0.68 + emphasis, 0, 1);
    const smoothing = targetOpening > prevOpening ? 0.48 : 0.18;
    const opening = smoothValue(prevOpening, targetOpening, smoothing);

    prevOpening = opening;
    prevEnergy = gatedEnergy;

    const diffRms = Math.sqrt(diffEnergy / length);
    const lowDominance = clamp(1 - diffRms / Math.max(0.001, rms * 2.8), 0, 1);
    const zcr = zeroCrossings / length;
    const roundedCandidate =
      gatedEnergy > 0.08
        ? clamp((lowDominance - 0.35) * 1.4 + (0.12 - zcr) * 3.2, 0, 1)
        : 0;
    const roundedness = smoothValue(prevRounded, roundedCandidate, 0.28);
    prevRounded = roundedness;

    const finalOpening =
      gatedEnergy === 0
        ? clamp(opening * 0.35, 0, 0.08)
        : clamp(0.02 + opening * (0.42 - roundedness * 0.05), 0.02, 0.42);

    mouthOpen.push(finalOpening);
    mouthFunnel.push(clamp(roundedness * 0.028, 0, 0.028));
    dt.push(frameMs);
  }

  return {
    name: "blendshapes",
    dt,
    vs: {
      jawOpen: mouthOpen,
      mouthFunnel,
    },
  };
}

function setRealtimeBlendshape(
  mtAvatar: TalkingHeadInstance["mtAvatar"],
  key: string,
  value: number | null,
) {
  const target = mtAvatar?.[key];
  if (!target) return;
  target.realtime = value;
  target.needsUpdate = true;
}

export function AvaturnAvatar({ speaking, level = 0, audioClip = null, className = "" }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<TalkingHeadInstance | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastClipIdRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [statusText, setStatusText] = useState("Avaturn Realistic hazırlanıyor...");

  useEffect(() => {
    let cancelled = false;

    async function setupAvatar() {
      const host = hostRef.current;
      if (!host) return;

      setLoadState("loading");
      setStatusText("Avaturn Realistic hazırlanıyor...");

      try {
        const mod = await import(/* @vite-ignore */ TALKING_HEAD_MODULE_URL);
        if (cancelled || !hostRef.current) return;

        const audioCtx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
        audioCtxRef.current = audioCtx;
        const TalkingHeadCtor = mod?.TalkingHead as new (node: HTMLElement, options: Record<string, unknown>) => TalkingHeadInstance;
        const head = new TalkingHeadCtor(hostRef.current, {
          cameraView: "head",
          cameraDistance: -0.08,
          cameraY: 0.02,
          cameraRotateEnable: false,
          cameraPanEnable: false,
          cameraZoomEnable: false,
          audioCtx,
          avatarIdleEyeContact: 0.8,
          avatarSpeakingEyeContact: 0.92,
          avatarIdleHeadMove: 0.002,
          avatarSpeakingHeadMove: 0.01,
          avatarIdleBodyMove: 0,
          avatarSpeakingBodyMove: 0,
          avatarIgnoreCamera: true,
        });

        headRef.current = head;

        await head.showAvatar(
          {
            url: AVATURN_URL,
            body: "F",
            avatarMood: "neutral",
            baseline: {
              headRotateX: 0.02,
              headRotateY: 0,
              headRotateZ: 0,
              eyesLookDown: 0,
              eyesLookUp: 0,
              eyesLookLeft: 0,
              eyesLookRight: 0,
              eyeBlinkLeft: 0.08,
              eyeBlinkRight: 0.08,
            },
          },
          (_url, event) => {
            if (!event || cancelled) return;
            if (event.lengthComputable && event.total > 0) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setStatusText(`Avaturn Realistic yükleniyor... %${percent}`);
            }
          },
        );

        if (cancelled) {
          head.stop?.();
          audioCtx.close().catch(() => undefined);
          return;
        }

        setLoadState("ready");
        setStatusText("Avaturn Realistic hazır");

        const onVisibilityChange = () => {
          if (document.visibilityState === "visible") head.start?.();
          else head.stop?.();
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        cleanupRef.current = () => {
          document.removeEventListener("visibilitychange", onVisibilityChange);
          head.stopSpeaking?.();
          head.stop?.();
          audioCtx.close().catch(() => undefined);
        };
      } catch (error) {
        console.error("Avaturn avatar load failed", error);
        if (!cancelled) {
          setLoadState("error");
          setStatusText("Avaturn yüklenemedi");
        }
      }
    }

    setupAvatar();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      headRef.current = null;
      audioCtxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const head = headRef.current;
    const audioCtx = audioCtxRef.current;
    const speakAudio = head?.speakAudio;
    if (!speakAudio || !audioCtx || !audioClip || loadState !== "ready") return;
    if (lastClipIdRef.current === audioClip.id) return;

    lastClipIdRef.current = audioClip.id;

    let cancelled = false;

    const playClip = async () => {
      try {
        await audioCtx.resume();
        const arrayBuffer = await audioClip.blob.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        if (cancelled) return;

        const anim = buildBlendshapeAnimation(decoded, 1.55);
        head.stopSpeaking?.();
        await speakAudio(
          {
            audio: decoded,
            anim,
          },
          {
            avatarMood: "neutral",
            avatarMute: true,
            isRaw: true,
          },
        );
      } catch (error) {
        console.error("Avaturn audio playback failed", error);
      }
    };

    playClip();

    return () => {
      cancelled = true;
    };
  }, [audioClip, loadState]);

  useEffect(() => {
    const head = headRef.current;
    if (!head?.mtAvatar) return;

    const clamped = Math.max(0, Math.min(level || 0, 1));
    const jawOpen = speaking ? 0.01 + clamped * 0.22 : clamped * 0.03;
    const mouthFunnel = speaking ? clamped * 0.028 : 0;
    const mouthShrugUpper = speaking ? clamped * 0.02 : 0;
    const eyesWide = speaking ? Math.min(0.08, 0.02 + clamped * 0.035) : 0.01;

    setRealtimeBlendshape(head.mtAvatar, "jawOpen", jawOpen);
    setRealtimeBlendshape(head.mtAvatar, "mouthOpen", jawOpen);
    setRealtimeBlendshape(head.mtAvatar, "mouthFunnel", mouthFunnel);
    setRealtimeBlendshape(head.mtAvatar, "mouthShrugUpper", mouthShrugUpper);
    setRealtimeBlendshape(head.mtAvatar, "eyesWideLeft", eyesWide);
    setRealtimeBlendshape(head.mtAvatar, "eyesWideRight", eyesWide);
  }, [level, speaking]);

  useEffect(() => {
    return () => {
      const mtAvatar = headRef.current?.mtAvatar;
      if (!mtAvatar) return;

      setRealtimeBlendshape(mtAvatar, "jawOpen", null);
      setRealtimeBlendshape(mtAvatar, "mouthOpen", null);
      setRealtimeBlendshape(mtAvatar, "mouthFunnel", null);
      setRealtimeBlendshape(mtAvatar, "mouthShrugUpper", null);
      setRealtimeBlendshape(mtAvatar, "eyesWideLeft", null);
      setRealtimeBlendshape(mtAvatar, "eyesWideRight", null);
    };
  }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-[28px] bg-[#050816] ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,228,196,0.22),transparent_22%),radial-gradient(circle_at_50%_30%,rgba(148,163,184,0.14),transparent_40%),linear-gradient(180deg,#312e81_0%,#111827_32%,#050816_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,244,214,0.16),transparent_18%),radial-gradient(circle_at_20%_18%,rgba(96,165,250,0.12),transparent_25%),radial-gradient(circle_at_80%_22%,rgba(244,114,182,0.08),transparent_22%)] mix-blend-screen" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(3,7,18,0.32)_100%)]" />

      <div ref={hostRef} className="absolute inset-0 z-10" />

      <div className="absolute left-4 top-4 z-20 rounded-full border border-sky-300/20 bg-slate-950/50 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-sky-100/90 backdrop-blur">
        Avaturn Realistic
      </div>

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/40 px-4 py-1.5 text-xs text-slate-200/80 backdrop-blur">
        {statusText}
      </div>

      {loadState !== "ready" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-5 py-4 text-sm text-slate-100/90 backdrop-blur">
            {loadState === "error" ? "Avaturn avatar yüklenemedi." : "Avaturn avatar yükleniyor..."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
