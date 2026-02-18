import type { SessionConfig } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export function ConsentPanel({
  value,
  onChange,
}: {
  value: SessionConfig;
  onChange: (v: SessionConfig) => void;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>2) Onaylar</span>
          <span className="text-red-500">*</span>
          <span className="text-sm font-normal text-muted-foreground">(Zorunlu)</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-1">
              Mikrofon erişimi
            </p>
            <p className="text-sm text-muted-foreground">Sesli akış için gerekir.</p>
          </div>
          <Switch
            checked={value.consent.mic}
            onCheckedChange={(v) => onChange({ ...value, consent: { ...value.consent, mic: v } })}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-1">
              Kamera erişimi
            </p>
            <p className="text-sm text-muted-foreground">
              Mülakat ekranında canlı self-preview ve davranış analizi için gerekir.
            </p>
          </div>
          <Switch
            checked={value.consent.camera}
            onCheckedChange={(v) => onChange({ ...value, consent: { ...value.consent, camera: v } })}
          />
        </div>

      </CardContent>
    </Card>
  );
}
