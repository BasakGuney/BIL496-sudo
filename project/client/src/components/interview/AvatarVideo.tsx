import { useEffect, useState } from "react";

type Props = {
  speaking: boolean;
  className?: string;
};

const SPEAKING_SRC = "/avatar/interviewer_speaking.mp4";
const LISTENING_SRC = "/avatar/interviewer_listening.mp4";

export function AvatarVideo({ speaking, className = "" }: Props) {
  const [speakingReady, setSpeakingReady] = useState(false);
  const [listeningReady, setListeningReady] = useState(false);
  const [mode, setMode] = useState<"speaking" | "listening">("listening");

  useEffect(() => {
    if (speaking && speakingReady) {
      setMode("speaking");
      return;
    }

    if (!speaking && listeningReady) {
      setMode("listening");
    }
  }, [speaking, speakingReady, listeningReady]);

  const showSpeaking = mode === "speaking";

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-2xl ${className}`}>
      <video
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${showSpeaking ? "opacity-100" : "opacity-0"}`}
        src={SPEAKING_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setSpeakingReady(true)}
      />
      <video
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${showSpeaking ? "opacity-0" : "opacity-100"}`}
        src={LISTENING_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setListeningReady(true)}
      />
    </div>
  );
}
