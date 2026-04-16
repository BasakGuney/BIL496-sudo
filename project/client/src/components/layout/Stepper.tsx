import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({ step }: { step: number }) {
  const steps = [
    { label: "Kurulum", id: 0 },
    { label: "Cihaz Testi", id: 1 },
    { label: "Mülakat", id: 2 },
    { label: "Rapor", id: 3 },
  ];

  return (
    <div className="w-full max-w-[560px] mx-auto mb-9 relative z-10">
      <div className="flex items-start justify-between w-full">
        {steps.map((s, idx) => {
          const isDone = idx < step;
          const isActive = idx === step;
          const isPending = idx > step;

          return (
            <div key={s.id} className="flex flex-col items-center relative flex-1">
              {/* Line */}
              {idx < steps.length - 1 && (
                <div 
                  className={cn(
                    "absolute top-[15px] left-[50%] right-[-50%] h-[1px] z-0 transition-colors duration-500",
                    isDone ? "bg-enterprise-accent/40" : "bg-enterprise-border"
                  )} 
                />
              )}

              {/* Dot */}
              <div
                className={cn(
                  "w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-semibold relative z-10 transition-all duration-300 border",
                  isDone && "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
                  isActive && "bg-gradient-to-br from-enterprise-accent to-enterprise-accent-2 border-none text-white shadow-[0_0_18px_rgba(124,92,252,0.5)] scale-110",
                  isPending && "bg-enterprise-surface border-enterprise-border text-enterprise-text-3"
                )}
              >
                {isDone ? <Check className="w-4 h-4" /> : s.id + 1}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "text-[10px] font-medium mt-2 transition-colors duration-300",
                  isDone && "text-emerald-500",
                  isActive && "text-enterprise-text-2",
                  isPending && "text-enterprise-text-3"
                )}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
