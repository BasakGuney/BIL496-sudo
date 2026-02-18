import { Badge } from "@/components/ui/badge";

export function Stepper({ step }: { step: 0 | 1 | 2 | 3 }) {
  const items = ["Kurulum", "Önizleme", "Mülakat", "Geri Bildirim"] as const;

  return (
  <div className="rounded-2xl border w-full p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div>
      <div className="text-sm font-medium">Akış</div>
      <div className="text-sm text-muted-foreground">
        Kurulum → Önizleme → Mülakat → Geri Bildirim
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
      {items.map((label, idx) => (
        <Badge
          key={label}
          variant={idx === step ? "default" : "outline"}
          className="rounded-full px-3 py-1"
        >
          {idx + 1}. {label}
        </Badge>
      ))}
    </div>
  </div>
  );
}
