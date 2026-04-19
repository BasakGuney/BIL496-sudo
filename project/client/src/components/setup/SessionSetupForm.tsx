import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModeBadge } from "./ModeBadge";
import type { Gender, InterviewType, Mode, SessionConfig } from "@/lib/types";
import { ChevronRight, FileText, Upload, User, Briefcase, Target, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

function formatTurkishUppercase(label: React.ReactNode) {
  if (typeof label === "string") {
    return label.toLocaleUpperCase("tr-TR");
  }
  return label;
}

function RequiredLabel({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <Label className="flex items-center gap-2 text-enterprise-text-2 mb-2">
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span className="text-xs font-semibold tracking-wider">{formatTurkishUppercase(children)}</span>
      <span className="text-enterprise-accent">*</span>
    </Label>
  );
}

export function SessionSetupForm({
  value,
  onChange,
  onStart,
  starting,
}: {
  value: SessionConfig;
  onChange: (v: SessionConfig) => void;
  onStart: (config: SessionConfig) => void;
  starting: boolean;
}) {
  const [draft, setDraft] = React.useState({
    firstName: value.firstName || "",
    lastName: value.lastName || "",
    role: value.role || "",
    companyOrIndustry: value.companyOrIndustry || "",
    domainInterest: value.domainInterest || "",
  });

  React.useEffect(() => {
    setDraft((prev) => ({
      firstName: prev.firstName || value.firstName || "",
      lastName: prev.lastName || value.lastName || "",
      role: prev.role || value.role || "",
      companyOrIndustry: prev.companyOrIndustry || value.companyOrIndustry || "",
      domainInterest: prev.domainInterest || value.domainInterest || "",
    }));
  }, [value.firstName, value.lastName, value.role, value.companyOrIndustry, value.domainInterest]);

  const isFilled =
    !!value.interviewType &&
    !!value.mode &&
    !!value.gender &&
    draft.firstName.trim().length > 0 &&
    draft.lastName.trim().length > 0 &&
    draft.role.trim().length > 0 &&
    draft.companyOrIndustry.trim().length > 0 &&
    draft.domainInterest.trim().length > 0;

  const consentOk = value.consent.mic && value.consent.camera;
  const canStart = isFilled && consentOk;

  const handleStart = () => {
    const merged: SessionConfig = {
      ...value,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      role: draft.role.trim(),
      companyOrIndustry: draft.companyOrIndustry.trim(),
      domainInterest: draft.domainInterest.trim(),
    };
    onChange(merged);
    onStart(merged);
  };

  const handleCvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file || file.type !== "application/pdf") {
      onChange({ ...value, cvFile: null });
      return;
    }

    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(reader.error || new Error("PDF okunamadı."));
      reader.readAsDataURL(file);
    });

    onChange({
      ...value,
      cvFile: { name: file.name, mimeType: file.type, dataBase64 },
    });
  };

  return (
    <div className="grid gap-8">
      {/* Identity Section */}
      <div className="grid gap-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid gap-2">
            <RequiredLabel icon={User}>Ad</RequiredLabel>
            <Input
              className="bg-enterprise-surface-2 border-enterprise-border focus:border-enterprise-accent rounded-xl h-11 transition-all"
              value={draft.firstName}
              placeholder="Örn: Ayşe"
              onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <RequiredLabel icon={User}>Soyad</RequiredLabel>
            <Input
              className="bg-enterprise-surface-2 border-enterprise-border focus:border-enterprise-accent rounded-xl h-11 transition-all"
              value={draft.lastName}
              placeholder="Örn: Yılmaz"
              onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid gap-2">
            <RequiredLabel icon={Zap}>Cinsiyet</RequiredLabel>
            <Select value={value.gender} onValueChange={(v) => onChange({ ...value, gender: v as Gender })}>
              <SelectTrigger className="bg-enterprise-surface-2 border-enterprise-border rounded-xl h-11 text-xs">
                <SelectValue placeholder="Seçim yapın" />
              </SelectTrigger>
              <SelectContent className="bg-enterprise-surface-2 border-enterprise-border text-white">
                <SelectItem value="Kadın">Kadın</SelectItem>
                <SelectItem value="Erkek">Erkek</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <RequiredLabel icon={Briefcase}>Mülakat Tipi</RequiredLabel>
            <Select
              value={value.interviewType}
              onValueChange={(v) => onChange({ ...value, interviewType: v as InterviewType })}
            >
              <SelectTrigger className="bg-enterprise-surface-2 border-enterprise-border rounded-xl h-11 text-xs">
                <SelectValue placeholder="Tip Seçin" />
              </SelectTrigger>
              <SelectContent className="bg-enterprise-surface-2 border-enterprise-border text-white">
                <SelectItem value="HR">IK (İnsan Kaynakları)</SelectItem>
                <SelectItem value="Technical">Teknik Mülakat</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Role & Industry */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="grid gap-2">
          <RequiredLabel icon={Target}>Hedef Rol</RequiredLabel>
          <Input
            className="bg-enterprise-surface-2 border-enterprise-border rounded-xl h-11 transition-all"
            value={draft.role}
            placeholder="Frontend Developer"
            onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <RequiredLabel icon={Briefcase}>Şirket / Sektör</RequiredLabel>
          <Input
            className="bg-enterprise-surface-2 border-enterprise-border rounded-xl h-11 transition-all"
            value={draft.companyOrIndustry}
            placeholder="E-ticaret / Finans"
            onChange={(e) => setDraft((p) => ({ ...p, companyOrIndustry: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <RequiredLabel icon={Zap}>Uzmanlık / İlgi Alanı</RequiredLabel>
        <Input
          className="bg-enterprise-surface-2 border-enterprise-border rounded-xl h-11 transition-all"
          value={draft.domainInterest}
          placeholder="Örn: React, Node.js, Sistem Mimarisi"
          onChange={(e) => setDraft((p) => ({ ...p, domainInterest: e.target.value }))}
        />
      </div>

      {/* CV Section */}
      <div className="grid gap-2">
        <Label className="flex items-center gap-2 text-enterprise-text-2 mb-2">
          <Upload className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold tracking-wider">{formatTurkishUppercase("CV Yükle (PDF)")}</span>
        </Label>
        
        <div className="relative group">
          <input
            type="file"
            accept="application/pdf"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            onChange={handleCvFileChange}
          />
          <div className="w-full h-24 rounded-2xl border border-dashed border-enterprise-border bg-enterprise-surface-2/30 group-hover:bg-enterprise-surface-2/50 transition-all flex flex-col items-center justify-center gap-2">
            {value.cvFile ? (
              <>
                <FileText className="w-8 h-8 text-enterprise-accent" />
                <span className="text-xs text-enterprise-text-2 font-medium">{value.cvFile.name}</span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-enterprise-text-3 group-hover:text-enterprise-accent transition-colors" />
                <span className="text-xs text-enterprise-text-3">PDF dosyasını buraya sürükle veya tıkla</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <RequiredLabel icon={Zap}>Mod Seçimi</RequiredLabel>
        <Select value={value.mode} onValueChange={(v) => onChange({ ...value, mode: v as Mode })}>
          <SelectTrigger className="bg-enterprise-surface-2 border-enterprise-border rounded-xl h-11 text-xs">
            <SelectValue placeholder="Mod" />
          </SelectTrigger>
          <SelectContent className="bg-enterprise-surface-2 border-enterprise-border text-white">
            <SelectItem value="Supportive">Supportive (Destekleyici)</SelectItem>
            <SelectItem value="Neutral">Neutral (Tarafsız)</SelectItem>
          </SelectContent>
        </Select>
        <div className="mt-1">
          <ModeBadge mode={value.mode} />
        </div>
      </div>

      <Button 
        className="bg-gradient-to-br from-enterprise-accent to-enterprise-accent-2 transition-all text-white font-bold rounded-xl h-14 text-sm mt-4 shadow-[0_8px_24px_rgba(124,92,252,0.3)] disabled:opacity-50" 
        onClick={handleStart} 
        disabled={!canStart || starting}
      >
        {starting ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Hazırlanıyor...
          </span>
        ) : (
          <>
            {canStart ? "Mülakatı Hazırla" : "Eksik Bilgileri Tamamla"}
            <ChevronRight className="ml-2 h-5 w-5" />
          </>
        )}
      </Button>
    </div>
  );
}
