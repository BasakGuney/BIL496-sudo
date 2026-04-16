import { useState } from "react";
import { ShieldCheck, Sparkles, History, Plus, Video, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

export function TopBar({ 
  onNavigateHistory,
  onNewInterview 
}: { 
  onNavigateHistory?: () => void;
  onNewInterview?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-[100] border-b border-enterprise-border bg-enterprise-bg/85 backdrop-blur-2xl">
      <div className="max-w-[1280px] mx-auto px-8 h-[58px] flex items-center justify-between">
        {/* Logo */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer no-underline group"
          onClick={onNewInterview}
        >
          <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-enterprise-accent to-enterprise-accent-2 flex items-center justify-center shadow-[0_4px_14px_rgba(124,92,252,0.4)] transition-transform">
            <Sparkles className="w-4 h-4 text-white fill-none stroke-[2]" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">InterviewAI</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-enterprise-accent/15 border border-enterprise-accent/30 text-enterprise-accent-2 rounded-full">
            Beta
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onNavigateHistory && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-enterprise-text-2 hover:text-white hover:bg-enterprise-surface-2 border border-enterprise-border hover:border-enterprise-border-ho rounded-lg h-8 px-3 text-xs"
              onClick={onNavigateHistory}
            >
              <History className="mr-2 h-3.5 w-3.5" />
              Geçmiş
            </Button>
          )}

          <Button 
            variant="ghost" 
            size="sm" 
            className="text-enterprise-text-2 hover:text-white hover:bg-enterprise-surface-2 border border-enterprise-border hover:border-enterprise-border-ho rounded-lg h-8 px-3 text-xs"
            onClick={() => setOpen(true)}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Gizlilik
          </Button>
          
          {onNewInterview && (
            <Button 
              size="sm" 
              className="bg-gradient-to-br from-enterprise-accent to-enterprise-accent-2 transition-all text-white font-semibold rounded-lg h-8 px-4 text-xs shadow-[0_4px_12px_rgba(124,92,252,0.3)]"
              onClick={onNewInterview}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Yeni Mülakat
            </Button>
          )}
        </div>
      </div>

      {/* Info Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[560px] bg-enterprise-surface border-enterprise-border rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-white">
              <ShieldCheck className="h-5 w-5 text-enterprise-accent" />
              Gizlilik & Onaylar Hakkında
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <p className="text-sm text-enterprise-text-2 leading-relaxed">
              Bu uygulama, canlı mülakat deneyimini sunmak ve oturum sonunda geri bildirim üretmek için
              ses/görüntü ve konuşma dökümünden yararlanabilir. Verileriniz yalnızca analiz amaçlı işlenir.
            </p>

            <Separator className="bg-enterprise-border" />

            <div className="space-y-8">
              {/* Kamera Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-accent/10 flex items-center justify-center border border-enterprise-accent/20">
                    <Video className="w-4 h-4 text-enterprise-accent" />
                  </div>
                  <div className="text-sm font-bold text-white uppercase tracking-wider">Kamera Erişimi</div>
                </div>
                
                <div className="pl-10 space-y-4">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-enterprise-text-3">Toplanan Veri</div>
                    <p className="text-xs text-enterprise-text-2">Gerçek zamanlı kamera görüntüsü ve yüz analizi.</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-enterprise-text-3">Kullanım Amacı</div>
                    <p className="text-xs text-enterprise-text-2">Davranış analizi, göz teması takibi ve profesyonel duruş değerlendirmesi.</p>
                  </div>
                </div>
              </div>

              <div className="h-px bg-enterprise-border mx-4 opacity-50" />

              {/* Mikrofon Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <Mic className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-sm font-bold text-white uppercase tracking-wider">Mikrofon Erişimi</div>
                </div>
                
                <div className="pl-10 space-y-4">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-enterprise-text-3">Toplanan Veri</div>
                    <p className="text-xs text-enterprise-text-2">Ses akışı ve canlı konuşma dökümü (transcript).</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-enterprise-text-3">Kullanım Amacı</div>
                    <p className="text-xs text-enterprise-text-2">Real-time etkileşim, ses tonu analizi ve gelişim raporu için yanıt değerlendirmesi.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-enterprise-surface-2 border border-enterprise-border p-4 text-xs text-enterprise-text-2 italic leading-relaxed">
              <span className="font-bold text-enterprise-accent not-italic">Önemli:</span> Mülakatı bitirdiğinizde 
              tüm medya yakalama işlemleri otomatik olarak sonlandırılır. Kurulum aşamasında verdiğiniz izinleri 
              istediğiniz zaman tarayıcı ayarlarından geri çekebilirsiniz.
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button className="bg-enterprise-surface-3 hover:bg-enterprise-surface-2 border border-enterprise-border text-white rounded-lg h-9 px-6 text-sm" onClick={() => setOpen(false)}>
              Anladım
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
