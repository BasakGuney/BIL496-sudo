import { useMemo, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Stepper } from "@/components/layout/Stepper";
import { SetupPage } from "@/pages/SetupPage";
import { InterviewPage } from "@/pages/InterviewPage";
import { FeedbackPage } from "@/pages/FeedbackPage";
import { PreviewPage } from "@/pages/PreviewPage";
import { HistoryPage } from "@/pages/HistoryPage";
import type { FeedbackReport, SessionConfig } from "@/lib/types";
import { getReport } from "@/lib/api";
import type { RouteKey } from "./routes";

export default function App() {
  const [route, setRoute] = useState<RouteKey>("setup");
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [report, setReport] = useState<FeedbackReport | null>(null);

  const stepIndex = useMemo(() => {
    switch (route) {
      case "setup": return 0;
      case "preview": return 1;
      case "interview": return 2;
      case "feedback": return 3;
      default: return -1;
    }
  }, [route]);

  const showStepper = stepIndex !== -1;

  const handleReset = () => {
    setConfig(null);
    setSessionId(null);
    setReport(null);
    setRoute("setup");
  };

  return (
    <Shell 
      onNavigateHistory={() => setRoute("history")}
      onNewInterview={handleReset}
    >
      <div className="w-full">
        {showStepper && (
          <div className="pt-8 px-8">
            <Stepper step={stepIndex} />
          </div>
        )}

        {route === "setup" && (
          <SetupPage
            onPrepared={(cfg, sid) => {
              setConfig(cfg);
              setSessionId(sid);
              setRoute("preview");
            }}
            onOpenReport={async (sid) => {
              try {
                const rep = await getReport(sid);
                setConfig(null);
                setSessionId(sid);
                setReport(rep);
                setRoute("feedback");
              } catch (error) {
                console.error("Failed to open report", error);
              }
            }}
          />
        )}

        {route === "preview" && config && (
          <PreviewPage
            config={config}
            sessionId={sessionId}
            setConfig={setConfig}
            onBack={() => setRoute("setup")}
            onStartInterview={() => {
              setRoute("interview");
            }}
          />
        )}

        {route === "interview" && config && sessionId && (
          <InterviewPage
            config={config}
            sessionId={sessionId}
            onFinish={(rep) => {
              setReport(rep);
              setRoute("feedback");
            }}
            onReportUpdate={(rep) => {
              setReport(rep);
            }}
            onBack={() => setRoute("preview")}
          />
        )}

        {route === "feedback" && report && sessionId && (
          <FeedbackPage
            initialReport={report}
            sessionId={sessionId}
            expectVision={Boolean(config?.consent?.camera)}
          />
        )}
        {route === "feedback" && (!report || !sessionId) && (
          <div className="max-w-[1280px] mx-auto px-8 py-20">
            <div className="card-style bg-enterprise-surface p-8 text-center">
              <p className="text-sm text-enterprise-text-2 mb-4">Rapor yüklenirken bir tutarsızlık oluştu.</p>
              <button
                type="button"
                className="h-10 px-5 rounded-xl bg-enterprise-accent text-white text-xs font-bold"
                onClick={() => setRoute("history")}
              >
                Geçmişe Dön
              </button>
            </div>
          </div>
        )}

        {route === "history" && (
          <HistoryPage onOpenReport={async (sid) => {
            try {
              const rep = await getReport(sid);
              setConfig(null);
              setSessionId(sid);
              setReport(rep);
              setRoute("feedback");
            } catch (error) {
              console.error("Failed to open report", error);
            }
          }} />
        )}
      </div>
    </Shell>
  );
}
