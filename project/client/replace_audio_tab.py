import re
import sys

filepath = 'c:/Users/basak/BIL496-sudo/project/client/src/pages/FeedbackPage.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

start_marker = "function AudioAnalysisTab({ report }: { report: FeedbackReport }) {"
end_marker = "\n}\n\n\nfunction VisionHighlights({ report }: { report: FeedbackReport }) {"

if start_marker not in text or end_marker not in text:
    print("Markers not found, aborting.")
    sys.exit(1)

pre = text.split(start_marker)[0]
post = end_marker + text.split(end_marker)[1]

new_comp = """function AudioAnalysisTab({ report }: { report: FeedbackReport }) {
  const llm = report.audioLlmReport;
  
  if (!llm) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Ses analizi henüz hazır değil. Lütfen bekleyin...</p>
        </CardContent>
      </Card>
    );
  }

  const scores = llm.scores ?? [];
  const clarityScore = scores.find(s => s.label === "Ses Netliği")?.score ?? 0;

  return (
    <div className="space-y-6">
      {/* Hero row */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card className="rounded-2xl">
          <CardContent className="pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 min-h-[180px]">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Genel Ses Netliği</p>
              <p className="text-6xl font-extrabold leading-none mb-3">
                {clarityScore}
                <span className="text-2xl font-semibold">/100</span>
              </p>
              <Badge className="rounded-full bg-blue-50 text-blue-700 border-blue-200" variant="outline">
                {llm.clarityBadge ?? "Analiz Edilemedi"}
              </Badge>
            </div>
            
            <div className="grid gap-3 w-full md:w-[42%]">
              <div className="rounded-xl border bg-gray-50/50 p-3.5">
                <div className="text-[12px] uppercase text-muted-foreground tracking-wider mb-1.5">Baskın Duygusal Eğilim</div>
                <div className="text-sm font-semibold leading-snug">{llm.dominantEmotion ?? "—"}</div>
              </div>
              <div className="rounded-xl border bg-gray-50/50 p-3.5">
                <div className="text-[12px] uppercase text-muted-foreground tracking-wider mb-1.5">İkinci Eğilim</div>
                <div className="text-sm font-semibold leading-snug">{llm.secondaryEmotion ?? "Yok"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-[20px]">Genel Değerlendirme</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[15px] text-muted-foreground leading-[1.6]">
              {llm.overallAnalysis ?? "Ses analizi yorumu bekleniyor..."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dimension scores */}
      {scores.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {scores.map((s) => (
            <Card key={s.label} className="rounded-2xl">
              <CardContent className="pt-5 flex flex-col min-h-[180px]">
                <h4 className="font-semibold text-[15px] mb-2.5 min-h-[38px]">{s.label}</h4>
                <div className="text-[28px] font-extrabold mb-2.5">{s.score}</div>
                <div className="text-[13px] text-muted-foreground leading-[1.5] mb-3 flex-1 min-h-[42px]">
                  {s.detail}
                </div>
                <Progress value={s.score} className="h-[10px] mt-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Content Grid: Ton Dağılımı + Konuşma Özeti */}
      <div className="grid gap-4 md:grid-cols-2">
        {llm.tonDistribution && llm.tonDistribution.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-[20px]">Genel Ton Dağılımı</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2.5 pl-5 text-foreground list-disc marker:text-muted-foreground">
                {llm.tonDistribution.map((item, i) => (
                  <li key={i} className="leading-[1.6]">
                    <strong>{item.label}:</strong> %{item.score}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        
        {llm.speechSummary && llm.speechSummary.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-[20px]">Konuşma Özeti</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2.5 pl-5 text-foreground list-disc marker:text-muted-foreground">
                {llm.speechSummary.map((item, i) => (
                  <li key={i} className="leading-[1.6]">{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recommendations */}
      {llm.recommendations && (llm.recommendations.nextInterview || llm.recommendations.performanceDevelopment) && (
        <div className="grid gap-4 md:grid-cols-2">
          {llm.recommendations.nextInterview && (
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-base text-foreground">Bir Sonraki Mülakatta</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[15px] text-zinc-700 leading-[1.7]">
                  {llm.recommendations.nextInterview}
                </p>
              </CardContent>
            </Card>
          )}
          {llm.recommendations.performanceDevelopment && (
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-base text-foreground">Performans Geliştirme</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[15px] text-zinc-700 leading-[1.7]">
                  {llm.recommendations.performanceDevelopment}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );"""

new_text = pre + new_comp + post
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Successfully replaced AudioAnalysisTab components in FeedbackPage.tsx")
