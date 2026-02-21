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
  value: SessionConfig;
  onChange: (v: SessionConfig) => void;
  onStart: () => void;
  starting: boolean;
}) {
  const isFilled =
    !!value.firstName.trim() &&
    !!value.lastName.trim() &&
    !!value.interviewType &&
    !!value.difficulty &&
    !!value.mode &&
    !!value.role.trim() &&
    !!value.companyOrIndustry.trim() &&
    !!value.domainInterest.trim();

  const consentOk = value.consent.mic && value.consent.camera;
  const canStart = isFilled && consentOk;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <RequiredLabel>İsim</RequiredLabel>
          <Input className="rounded-xl" value={value.firstName} onChange={(e) => onChange({ ...value, firstName: e.target.value })} placeholder="Örn: Ayşe" />
        </div>
        <div className="grid gap-2">
          <RequiredLabel>Soyisim</RequiredLabel>
          <Input className="rounded-xl" value={value.lastName} onChange={(e) => onChange({ ...value, lastName: e.target.value })} placeholder="Örn: Yılmaz" />
        </div>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Cinsiyet</RequiredLabel>
        <Select value={value.gender} onValueChange={(v) => onChange({ ...value, gender: v as any })}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Female">Kadın</SelectItem>
            <SelectItem value="Male">Erkek</SelectItem>
            <SelectItem value="Unspecified">Belirtmek istemiyorum</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Interview Type</RequiredLabel>
        <Select value={value.interviewType} onValueChange={(v) => onChange({ ...value, interviewType: v as any })}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="HR">HR</SelectItem>
            <SelectItem value="Technical">Technical (non-coding)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Target role / position</RequiredLabel>
        <Input className="rounded-xl" value={value.role} placeholder="Example: DevOps Engineer" onChange={(e) => onChange({ ...value, role: e.target.value })} />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Company / industry context</RequiredLabel>
        <Input className="rounded-xl" value={value.companyOrIndustry} placeholder="Example: Fintech / Banking" onChange={(e) => onChange({ ...value, companyOrIndustry: e.target.value })} />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Domain / interest area</RequiredLabel>
        <Input className="rounded-xl" value={value.domainInterest} placeholder="Example: Kubernetes / ML" onChange={(e) => onChange({ ...value, domainInterest: e.target.value })} />
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Difficulty</RequiredLabel>
        <Select value={value.difficulty} onValueChange={(v) => onChange({ ...value, difficulty: v as any })}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Difficulty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Junior">Junior</SelectItem>
            <SelectItem value="Intermediate">Intermediate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <RequiredLabel>Mode</RequiredLabel>
        <Select value={value.mode} onValueChange={(v) => onChange({ ...value, mode: v as any })}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Supportive">Supportive</SelectItem>
            <SelectItem value="Neutral">Neutral</SelectItem>
          </SelectContent>
        </Select>
        <ModeBadge mode={value.mode} />
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="text-red-500">*</span> Zorunlu: Mikrofon ve Kamera onayı verilmeden oturum başlatılamaz.
      </div>

      <Button className="rounded-xl" onClick={onStart} disabled={!canStart || starting}>
        {starting ? "Hazırlanıyor..." : canStart ? "Örnek Sorulara Geç" : !consentOk ? "Mikrofon + Kamera onayı gerekli" : "Lütfen tüm zorunlu alanları doldur"}
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
