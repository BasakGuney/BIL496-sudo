import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function LiveTranscript({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Canlı Transcript (STT)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Demo amaçlı manuel yazabilirsin. Gerçekte STT çıktısı buraya akacak.
        </p>
        <Textarea
          className="min-h-[240px] rounded-xl"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Konuşma metni..."
        />
      </CardContent>
    </Card>
  );
}
