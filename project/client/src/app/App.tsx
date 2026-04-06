import { useMemo, useState } from "react";
import { Shell } from "@/components/layout/Shell";

import { Stepper } from "@/components/layout/Stepper";
import { SetupPage } from "@/pages/SetupPage";
import { InterviewPage } from "@/pages/InterviewPage";
import { FeedbackPage } from "@/pages/FeedbackPage";
import { PreviewPage } from "@/pages/PreviewPage";
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
      case "setup":
        return 0;
      case "preview":
        return 1;
      case "interview":
        return 2;
      case "feedback":
        return 3;
    }
  }, [route]);

  return (
    <Shell>
      <div className="min-h-[calc(100vh-56px)] w-full p-4 md:p-6 space-y-6">
        <div className="flex justify-between items-center mb-4">
          <Stepper step={stepIndex} />
        </div>
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
            onBack={() => setRoute("preview")}
          />
        )}

        {route === "feedback" && report && sessionId && (
          <FeedbackPage
            initialReport={report}
            sessionId={sessionId}
            onNew={() => {
              setConfig(null);
              setSessionId(null);
              setReport(null);
              setRoute("setup");
            }}
          />
        )}
      </div>
    </Shell>
  );
}
