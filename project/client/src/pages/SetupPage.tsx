import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionSetupForm } from "@/components/setup/SessionSetupForm";
import { ConsentPanel } from "@/components/setup/ConsentPanel";
import type { SessionConfig } from "@/lib/types";

export function SetupPage({
  onPrepared,
}: {
  onPrepared: (config: SessionConfig) => void;
}) {
  const [config, setConfig] = useState<SessionConfig>(() => ({
    firstName: "",
    lastName: "",
    gender: "Kadın",
    interviewType: "HR",
    role: "Örn: Full-Stack Developer",
    companyOrIndustry: "Örn: Google",
    domainInterest: "Örn: Kubernetes",
    difficulty: "Junior",
    mode: "Supportive",
    consent: { mic: false, camera: false },
  }));

  async function handlePrepare(nextConfig: SessionConfig) {
    const canStart = nextConfig.consent.mic && nextConfig.consent.camera;
    if (!canStart) return;
    onPrepared(nextConfig);
  }

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
            starting={false}
          />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <ConsentPanel value={config} onChange={setConfig} />
      </div>
    </div>
  );
}
