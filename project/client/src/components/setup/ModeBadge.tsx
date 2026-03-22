import { Badge } from "@/components/ui/badge";
import type { Mode } from "@/lib/types";
import { Sparkles, ShieldCheck } from "lucide-react";

export function ModeBadge({ mode }: { mode: Mode }) {
  const isSupportive = mode === "Supportive";
  const Icon = isSupportive ? Sparkles : ShieldCheck;

  return (
    <div className="flex items-start gap-2">
      <Badge variant="outline" className="rounded-full">
        <Icon className="mr-2 h-3.5 w-3.5" />
        {isSupportive ? "Destekleyici" : "Tarafsız"}
      </Badge>
      <p className="text-sm text-muted-foreground">
        {isSupportive
          ? "Koçluk odaklı: konu dışına çıkınca nazikçe yönlendirir, emin değilken küçük ipuçlarıyla devam ettirir."
          : "Standart profesyonel ton: aynı değerlendirme rubriği, minimum müdahale."}
      </p>
    </div>
  );
}
