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
  onStart: (config: SessionConfig) => void;
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
    onStart(merged);
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
        <RequiredLabel>Mülakat Tipi</RequiredLabel>
        <Select
          value={value.interviewType}
          onValueChange={(v) => onChange({ ...value, interviewType: v as any })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Tip Seçin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HR">İnsan Kaynakları (HR)</SelectItem>
            <SelectItem value="Technical">Teknik</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Hedef rol / pozisyon</RequiredLabel>
        <Input
          className="rounded-xl"
          value={draft.role}
          placeholder={value.role || "Örn: Full-Stack Developer"}
          onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Şirket / Sektör bağlamı</RequiredLabel>
        <Input
          className="rounded-xl"
          value={draft.companyOrIndustry}
          placeholder={value.companyOrIndustry || "Örn: Google"}
          onChange={(e) => setDraft((p) => ({ ...p, companyOrIndustry: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Alan / İlgi alanı</RequiredLabel>
        <Input
          className="rounded-xl"
          value={draft.domainInterest}
          placeholder={value.domainInterest || "Örn: Kubernetes / Makine Öğrenmesi"}
          onChange={(e) => setDraft((p) => ({ ...p, domainInterest: e.target.value }))}
        />
      </div>


      <div className="grid gap-2">
        <RequiredLabel>Mod</RequiredLabel>
        <Select value={value.mode} onValueChange={(v) => onChange({ ...value, mode: v as any })}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Mod" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Supportive">Supportive (Destekleyici)</SelectItem>
            <SelectItem value="Neutral">Neutral (Tarafsız)</SelectItem>
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
