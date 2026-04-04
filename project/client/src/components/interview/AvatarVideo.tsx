type Props = {
  speaking: boolean;
  className?: string;
};

export function AvatarVideo({ speaking, className = "" }: Props) {
  return (
    <div className={`relative h-full w-full overflow-hidden rounded-2xl ${className}`}>
      <video
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${speaking ? "opacity-100" : "opacity-0"}`}
        src="/avatar/interviewer_speaking.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
      <video
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${speaking ? "opacity-0" : "opacity-100"}`}
        src="/avatar/interviewer_listening.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}
