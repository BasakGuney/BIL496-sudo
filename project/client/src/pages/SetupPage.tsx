import { useState } from "react";
import { SessionSetupForm } from "@/components/setup/SessionSetupForm";
import { ConsentPanel } from "@/components/setup/ConsentPanel";
import type { SessionConfig } from "@/lib/types";
import { startSession } from "@/lib/api";
import { ShieldCheck, Info } from "lucide-react";

export function SetupPage({
  onPrepared,
  onOpenReport: _onOpenReport,
}: {
  onPrepared: (config: SessionConfig, sessionId: string) => void;
  onOpenReport: (sessionId: string) => void;
}) {
  const [config, setConfig] = useState<SessionConfig>(() => ({
    firstName: "Basak",
    lastName: "Guney",
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

  return (
    <div className="max-w-[1280px] mx-auto px-8 py-10">
      <header className="mb-10">
        <h2 className="text-[28px] font-extrabold tracking-tight text-white mb-2">Mülakat Kurulumu</h2>
        <p className="text-sm text-enterprise-text-2">Mülakat deneyiminizi kişiselleştirmek için bilgilerinizi girin ve ilgi alanlarınızı belirtin.</p>
      </header>
      
      <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
        {/* Left: Setup Form */}
        <div className="space-y-8">

          <div className="card-style bg-enterprise-surface/50 p-8">
            <SessionSetupForm
              value={config}
              onChange={setConfig}
              onStart={handlePrepare}
              starting={preparing}
            />
            {prepareError && (
              <div className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {prepareError}
              </div>
            )}
          </div>
        </div>

        {/* Right: Consent & Info */}
        <div className="space-y-6">
          <div className="card-style bg-enterprise-surface p-6 sticky top-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-enterprise-accent/10 border border-enterprise-accent/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-enterprise-accent" />
              </div>
              <h3 className="font-bold text-white">Erişim ve Onay</h3>
            </div>

            <ConsentPanel value={config} onChange={setConfig} />

            <div className="mt-8 pt-6 border-t border-enterprise-border">
              <div className="flex gap-3 text-xs text-enterprise-text-2 leading-relaxed">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-4 h-4 rounded-full bg-enterprise-surface-2 flex items-center justify-center border border-enterprise-border">
                    <Info className="w-2.5 h-2.5 text-enterprise-text-3" />
                  </div>
                </div>
                <p>
                  Mülakat süresince sesiniz ve görüntünüz analiz edilerek size gerçek zamanlı geri bildirim sağlanacaktır. 
                  Bu veriler yalnızca sizin gelişiminize katkı sağlamak amacıyla işlenir.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

