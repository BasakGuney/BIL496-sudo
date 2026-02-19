import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionSetupForm } from "@/components/setup/SessionSetupForm";
import { ConsentPanel } from "@/components/setup/ConsentPanel";
import type { SessionConfig } from "@/lib/types";
import { startSession } from "@/lib/mockApi";

export function SetupPage({
  onPrepared,
}: {
  onPrepared: (config: SessionConfig, sessionId: string, previewQuestions: string[]) => void;
}) {
  const [config, setConfig] = useState<SessionConfig>(() => ({
    firstName: "",
    lastName: "",
    gender: "Kadın",
    interviewType: "HR",
    role: "Example: DevOps Engineer",
    companyOrIndustry: "Example: Amazon",
    domainInterest: "Example: Kubernetes",
    difficulty: "Junior",
    mode: "Supportive",
    consent: { mic: false, camera: false },
  }));

  const [starting, setStarting] = useState(false);

  async function handlePrepare() {
    const canStart = config.consent.mic && config.consent.camera;
    if (!canStart) return;

    setStarting(true);
    const res = await startSession(config);
    setStarting(false);

    onPrepared(config, res.sessionId, res.previewQuestions);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>1) Oturum Kurulumu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SessionSetupForm
            value={config}
            onChange={setConfig}
            onStart={handlePrepare}
            starting={starting}
          />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <ConsentPanel value={config} onChange={setConfig} />
      </div>
    </div>
  );
}
