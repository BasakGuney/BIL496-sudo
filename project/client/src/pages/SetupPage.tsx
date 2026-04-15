import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionSetupForm } from "@/components/setup/SessionSetupForm";
import { ConsentPanel } from "@/components/setup/ConsentPanel";
import type { SessionConfig, SessionSummary } from "@/lib/types";
import { listReports, startSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText } from "lucide-react";

export function SetupPage({
  onPrepared,
  onOpenReport,
}: {
  onPrepared: (config: SessionConfig, sessionId: string) => void;
  onOpenReport: (sessionId: string) => void;
}) {
  const [config, setConfig] = useState<SessionConfig>(() => ({
    firstName: "Ece",
    lastName: "Subozkurt",
    gender: "Kadın",
    interviewType: "HR",
    role: "Frontend Developer",
    companyOrIndustry: "Teknoloji",
    domainInterest: "React ve Node.js",
    difficulty: "Junior",
    mode: "Supportive",
    consent: { mic: true, camera: true },
    cvFile: null,
    candidateBrief: null,
  }));
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");

  async function handlePrepare(nextConfig: SessionConfig) {
    const canStart = nextConfig.consent.mic && nextConfig.consent.camera;
    if (!canStart) return;

    setPreparing(true);
    setPrepareError("");
    try {
      const session = await startSession(nextConfig);
      if (!session.sessionId) {
        throw new Error("Oturum oluşturuldu ancak session kimliği alınamadı.");
      }
      onPrepared({
        ...nextConfig,
        candidateBrief: session.candidateBrief || nextConfig.candidateBrief || null,
      }, session.sessionId);
    } catch (error: any) {
      setPrepareError(error?.message || "Kurulum tamamlanamadı.");
      setPreparing(false);
    }
  }

  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    listReports(20)
      .then((items) => {
        if (cancelled) return;
        setHistory(items);
        setHistoryError("");
      })
      .catch((error: any) => {
        if (cancelled) return;
        setHistory([]);
        setHistoryError(error?.message || "Geçmiş oturumlar yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>1) Oturum Kurulumu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SessionSetupForm
            value={config}
            onChange={setConfig}
            onStart={handlePrepare}
            starting={preparing}
          />
          {prepareError && <div className="text-sm text-destructive">{prepareError}</div>}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <ConsentPanel value={config} onChange={setConfig} />

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Geçmiş Oturumlar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {historyLoading && (
              <div className="text-sm text-muted-foreground">Oturumlar yükleniyor...</div>
            )}
            {!historyLoading && historyError && (
              <div className="text-sm text-destructive">{historyError}</div>
            )}
            {!historyLoading && !historyError && history.length === 0 && (
              <div className="text-sm text-muted-foreground">Henüz kayıtlı oturum bulunamadı.</div>
            )}
            {!historyLoading && !historyError && history.length > 0 && (
              <div className="space-y-3">
                {history.map((item) => {
                  const createdAt = new Date(item.createdAt);
                  const dateLabel = Number.isNaN(createdAt.getTime())
                    ? item.createdAt
                    : createdAt.toLocaleString("tr-TR");
                  return (
                    <div
                      key={item.sessionId}
                      className="flex flex-col gap-2 rounded-xl border bg-white/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          {item.sessionId}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onOpenReport(item.sessionId)}>
                          Raporu Aç
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {dateLabel}
                        </span>
                        {item.overallScore !== null && (
                          <Badge variant="outline">Skor: {item.overallScore}</Badge>
                        )}
                        {item.hasTranscript && <Badge variant="outline">Transcript</Badge>}
                        {item.hasAudio && <Badge variant="outline">Ses</Badge>}
                        {item.hasVision && <Badge variant="outline">Görüntü</Badge>}
                      </div>
                      {item.transcriptPreview && (
                        <div className="text-xs text-muted-foreground">
                          {item.transcriptPreview}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
