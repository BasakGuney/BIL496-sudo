import { useCallback, useEffect, useMemo, useState } from "react";
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
  type NavigationSnapshot = {
    route: RouteKey;
    config: SessionConfig | null;
    sessionId: string | null;
    report: FeedbackReport | null;
  };

  const applyNavigationState = useCallback((nextState: NavigationSnapshot, { push = true, replace = false }: { push?: boolean; replace?: boolean } = {}) => {
    setRoute(nextState.route);
    setConfig(nextState.config);
    setSessionId(nextState.sessionId);
    setReport(nextState.report);

    if (typeof window === "undefined" || !push) return;

    if (replace) {
      window.history.replaceState(nextState, "");
      return;
    }

    window.history.pushState(nextState, "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialState: NavigationSnapshot = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : { route: "setup", config: null, sessionId: null, report: null };

    applyNavigationState(initialState, { push: false });
    window.history.replaceState(initialState, "");

    const handlePopState = (event: PopStateEvent) => {
      const snapshot: NavigationSnapshot = event.state && typeof event.state === "object"
        ? event.state
        : { route: "setup", config: null, sessionId: null, report: null };
      applyNavigationState(snapshot, { push: false });
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [applyNavigationState]);

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
    applyNavigationState({
      route: "setup",
      config: null,
      sessionId: null,
      report: null,
    });
  };

  return (
    <Shell 
      onNavigateHistory={() => applyNavigationState({ route: "history", config, sessionId, report })}
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
              applyNavigationState({
                route: "preview",
                config: cfg,
                sessionId: sid,
                report: null,
              });
            }}
            onOpenReport={async (sid) => {
              try {
                const rep = await getReport(sid);
                applyNavigationState({
                  route: "feedback",
                  config: null,
                  sessionId: sid,
                  report: rep,
                });
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
            onBack={() => window.history.back()}
            onStartInterview={() => {
              applyNavigationState({
                route: "interview",
                config,
                sessionId,
                report,
              });
            }}
          />
        )}

        {route === "interview" && config && sessionId && (
          <InterviewPage
            config={config}
            sessionId={sessionId}
            onFinish={(rep) => {
              applyNavigationState({
                route: "feedback",
                config,
                sessionId,
                report: rep,
              });
            }}
            onReportUpdate={(rep) => {
              setReport(rep);
            }}
            onBack={() => window.history.back()}
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
                onClick={() => applyNavigationState({ route: "history", config, sessionId, report })}
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
                applyNavigationState({
                  route: "feedback",
                  config: null,
                  sessionId: sid,
                  report: rep,
                });
              } catch (error) {
                console.error("Failed to open report", error);
              }
          }} />
        )}
      </div>
    </Shell>
  );
}
