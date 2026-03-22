import { useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

export function TopBar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-20 w-full border-b bg-background/70 backdrop-blur">
      <div className="w-full px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border bg-background">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">AI Mock Interview</div>
            <div className="text-xs text-muted-foreground">Mod Odaklı Davranış ve Geri Bildirim</div>
          </div>
        </div>

        <Button variant="outline" className="rounded-xl" onClick={() => setOpen(true)}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Gizlilik & Onay
        </Button>
      </div>

      {/* Info-only Privacy Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[560px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Gizlilik & Onaylar Hakkında
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bu uygulama, canlı mülakat deneyimini sunmak ve oturum sonunda geri bildirim üretmek için
              ses/görüntü ve konuşma dökümünden yararlanabilir. Mülakatı bitirdiğinizde kamera ve mikrofon
              yakalama işlemleri durdurulur.
            </p>

            <Separator />

            <div className="space-y-2">
              <div className="text-sm font-medium">Toplanan Veriler</div>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Kamera görüntüsü (mülakat ekranında önizleme ve analiz için)</li>
                <li>Mikrofon sesi (konuşma etkileşimi için)</li>
                <li>Canlı transcript (konuşmadan metin)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Kullanım Amaçları</div>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Soru-cevap akışını yönetmek ve gerçek zamanlı mülakat deneyimi sağlamak</li>
                <li>Oturum sonrası davranış analizi ve rapor üretmek</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Kontrol Sizde</div>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Mülakatı bitirince kamera/mikrofon yakalama durdurulur</li>
                <li>Onaylar kurulum adımında alınır ve mülakat başlamadan önce doğrulanır</li>
              </ul>
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <span className="font-medium">Not:</span> Bu ekran yalnızca bilgilendirme amaçlıdır.
              Onay yönetimi kurulum adımından yapılır.
            </div>
          </div>

          <DialogFooter>
            <Button className="rounded-xl" onClick={() => setOpen(false)}>
              Anladım
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
