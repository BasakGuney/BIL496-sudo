import { useEffect, useRef, useState } from "react";

type Props = {
  speaking: boolean;
  className?: string;
};

const SPEAKING_SRC = "/avatar/interviewer_speaking.mp4";
const LISTENING_SRC = "/avatar/interviewer_listening.mp4";

export function AvatarVideo({ speaking, className = "" }: Props) {
  const [speakingReady, setSpeakingReady] = useState(false);
  const [listeningReady, setListeningReady] = useState(false);
  const [speakingFrameReady, setSpeakingFrameReady] = useState(false);
  const [listeningFrameReady, setListeningFrameReady] = useState(false);
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const speakingRef = useRef<HTMLVideoElement | null>(null);
  const listeningRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (speaking && speakingReady && speakingFrameReady) {
      setMode("speaking");
      return;
    }

    if (!speaking && listeningReady && listeningFrameReady) {
      setMode("listening");
    }
  }, [speaking, speakingReady, listeningReady, speakingFrameReady, listeningFrameReady]);

  useEffect(() => {
    const tryPlay = async (video: HTMLVideoElement | null) => {
      if (!video) return;
      try {
        await video.play();
      } catch {
        // Autoplay may be blocked, but videos are muted so this usually passes.
      }
    };

    tryPlay(speakingRef.current);
    tryPlay(listeningRef.current);
  }, []);

  const speakingOnTop = mode === "speaking";

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-2xl ${className}`}>
      <video
        className={`absolute inset-0 h-full w-full object-cover ${speakingOnTop ? "z-20" : "z-10"}`}
        src={SPEAKING_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        ref={speakingRef}
        onLoadedData={(event) => {
          const video = event.currentTarget;
          setSpeakingReady(true);
          if (video.currentTime < 0.04) {
            try {
              video.currentTime = 0.04;
            } catch {
              // Safari can throw while seeking before metadata; ignore.
            }
          }
        }}
        onTimeUpdate={(event) => {
          if (speakingFrameReady) return;
          if (event.currentTarget.currentTime > 0.01) setSpeakingFrameReady(true);
        }}
      />
      <video
        className={`absolute inset-0 h-full w-full object-cover ${speakingOnTop ? "z-10" : "z-20"}`}
        src={LISTENING_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        ref={listeningRef}
        onLoadedData={(event) => {
          const video = event.currentTarget;
          setListeningReady(true);
          if (video.currentTime < 0.04) {
            try {
              video.currentTime = 0.04;
            } catch {
              // Safari can throw while seeking before metadata; ignore.
            }
          }
        }}
        onTimeUpdate={(event) => {
          if (listeningFrameReady) return;
          if (event.currentTarget.currentTime > 0.01) setListeningFrameReady(true);
        }}
      />
    </div>
  );
}
