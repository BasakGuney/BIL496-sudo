import { Badge } from "@/components/ui/badge";

export function ScoreHero({
  score,
  label = "Genel Skor",
  subtext,
}: {
  score: number;
  label?: string;
  subtext?: string;
}) {
  // SVG Ring calculation
  // radius = 47, circumference = 2 * PI * 47 approx 295.3
  const r = 47;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, score)) / 100) * circ;

  return (
    <div className="card-style bg-enterprise-surface p-6 flex flex-col items-center text-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,92,252,0.08),transparent_65%)] pointer-events-none" />
      
      <div className="relative w-[120px] h-[120px] mb-4">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <defs>
            <linearGradient id="scoreHeroGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7c5cfc" />
              <stop offset="100%" stopColor="#5b8af7" />
            </linearGradient>
          </defs>
          <circle 
            className="fill-none stroke-white/5 stroke-[9]" 
            cx="55" 
            cy="55" 
            r={r} 
          />
          <circle 
            className="fill-none stroke-[9] stroke-linecap-round transition-all duration-1000 ease-out" 
            cx="55" 
            cy="55" 
            r={r} 
            stroke="url(#scoreHeroGradient)"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ filter: "drop-shadow(0 0 7px rgba(124,92,252,0.55))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-black leading-none bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            {score}
          </div>
          <div className="text-[10px] text-enterprise-text-3 font-semibold mt-1">/100</div>
        </div>
      </div>

      <Badge className="relative mt-1 border bg-enterprise-accent/10 border-enterprise-accent/20 text-enterprise-accent-2 text-[10px] uppercase tracking-wider">
        {label}
      </Badge>
      
      {subtext ? (
        <div className="relative text-[11px] text-enterprise-text-3 mt-3 leading-relaxed">
          {subtext}
        </div>
      ) : null}
    </div>
  );
}
