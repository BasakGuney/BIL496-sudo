type Props = {
  speaking: boolean;
  className?: string;
};

const assetBase = import.meta.env.BASE_URL || "/";
const SPEAKING_SRC = `${assetBase}avatar/interviewer_speaking.mp4`;
const LISTENING_SRC = `${assetBase}avatar/interviewer_listening.mp4`;

export function AvatarVideo({ speaking, className = "" }: Props) {
  return (
    <div className={`relative h-full w-full overflow-hidden rounded-2xl ${className}`}>
      <video
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${speaking ? "opacity-100" : "opacity-0"}`}
        src={SPEAKING_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
      <video
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${speaking ? "opacity-0" : "opacity-100"}`}
        src={LISTENING_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}
