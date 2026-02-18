import { Badge } from "@/components/ui/badge";

export function QuestionCard({ question }: { question: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Soru</p>
        <Badge variant="outline" className="rounded-full">TTS</Badge>
      </div>
      <p className="mt-2 text-base">{question}</p>
    </div>
  );
}
