import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModeBadge } from "./ModeBadge";
import type { SessionConfig } from "@/lib/types";
import { ChevronRight } from "lucide-react";

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="flex items-center gap-1">
      <span>{children}</span>
      <span className="text-red-500">*</span>
    </Label>
  );
}

export function SessionSetupForm({
  value,
  onChange,
  onStart,
  starting,
}: {
  value: SessionConfig;                 // parent'tan gelen config (placeholder kaynağı)
  onChange: (v: SessionConfig) => void; // parent state güncelleme
  onStart: () => void;
  starting: boolean;
}) {
  // Kullanıcının gerçekten yazdığı değerler (input içini dolduran şey)
  const [draft, setDraft] = React.useState({
    firstName: "",
    lastName: "",
    role: "",
    companyOrIndustry: "",
    domainInterest: "",
  });

  // Zorunlu alan kontrolü: Select'ler value'dan, text input'lar draft'tan (boşsa doldurulmamış say)
  const isFilled =
    !!value.interviewType &&
    !!value.difficulty &&
    !!value.mode &&
    !!value.gender &&
    draft.firstName.trim().length > 0 &&
    draft.lastName.trim().length > 0 &&
    draft.role.trim().length > 0 &&
    draft.companyOrIndustry.trim().length > 0 &&
    draft.domainInterest.trim().length > 0;

  // Consent de zorunlu
  const consentOk = value.consent.mic && value.consent.camera;

  const canStart = isFilled && consentOk;

  const handleStart = () => {
    // Zorunlu olduğu için draft boş olamaz; yine de güvenli olsun:
    const merged: SessionConfig = {
      ...value,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      role: draft.role.trim(),
      companyOrIndustry: draft.companyOrIndustry.trim(),
      domainInterest: draft.domainInterest.trim(),
    };

    onChange(merged);
    onStart();
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 md:grid-cols-2 md:gap-4">
        <div className="grid gap-2">
          <RequiredLabel>Ad</RequiredLabel>
          <Input
            className="rounded-xl"
            value={draft.firstName}
            placeholder="Örn: Ayşe"
            onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <RequiredLabel>Soyad</RequiredLabel>
          <Input
            className="rounded-xl"
            value={draft.lastName}
            placeholder="Örn: Yılmaz"
            onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Cinsiyet</RequiredLabel>
        <Select value={value.gender} onValueChange={(v) => onChange({ ...value, gender: v as any })}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Cinsiyet seçin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Kadın">Kadın</SelectItem>
            <SelectItem value="Erkek">Erkek</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Interview Type</RequiredLabel>
        <Select
          value={value.interviewType}
          onValueChange={(v) => onChange({ ...value, interviewType: v as any })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HR">HR</SelectItem>
            <SelectItem value="Technical">Technical (non-coding)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Target role / position</RequiredLabel>
        <Input
          className="rounded-xl"
          value={draft.role}
          placeholder={value.role || "e.g., Backend Developer"}
          onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Company / industry context</RequiredLabel>
        <Input
          className="rounded-xl"
          value={draft.companyOrIndustry}
          placeholder={value.companyOrIndustry || "e.g., Fintech / Banking"}
          onChange={(e) => setDraft((p) => ({ ...p, companyOrIndustry: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Domain / interest area</RequiredLabel>
        <Input
          className="rounded-xl"
          value={draft.domainInterest}
          placeholder={value.domainInterest || "e.g., Kubernetes / ML"}
          onChange={(e) => setDraft((p) => ({ ...p, domainInterest: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Difficulty</RequiredLabel>
        <Select
          value={value.difficulty}
          onValueChange={(v) => onChange({ ...value, difficulty: v as any })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Junior">Junior</SelectItem>
            <SelectItem value="Intermediate">Intermediate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Mode</RequiredLabel>
        <Select value={value.mode} onValueChange={(v) => onChange({ ...value, mode: v as any })}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Supportive">Supportive</SelectItem>
            <SelectItem value="Neutral">Neutral</SelectItem>
          </SelectContent>
        </Select>
        <ModeBadge mode={value.mode} />
      </div>

      {/* Oturum kurulumu (consent) zorunlu: yıldızlı not */}
      <div className="text-xs text-muted-foreground">
        <span className="text-red-500">*</span> Zorunlu: Mikrofon ve Kamera onayı verilmeden oturum başlatılamaz.
      </div>

      <Button className="rounded-xl" onClick={handleStart} disabled={!canStart || starting}>
        {starting
          ? "Hazırlanıyor..."
          : canStart
          ? "Örnek Sorulara Geç"
          : !consentOk
          ? "Mikrofon + Kamera onayı gerekli"
          : "Lütfen tüm zorunlu alanları doldur"}
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
