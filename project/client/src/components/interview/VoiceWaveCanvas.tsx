import React, { useEffect, useMemo, useRef } from "react";

type Props = {
  speaking: boolean;
  // 0..1 arası bir “ses seviyesi” gibi düşünebilirsin (demo için otomatik üretilebilir)
  level?: number;
};

export function VoiceWaveCanvas({ speaking, level }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  const seed = useMemo(() => Math.random() * 1000, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t0 = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(parent.clientWidth * dpr);
      canvas.height = Math.floor(parent.clientHeight * dpr);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onResize = () => resize();
    resize();
    window.addEventListener("resize", onResize);

    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;

      const dt = (now - t0) / 1000;
      t0 = now;

      // speaking ise hareket/amp daha yüksek
      const base = speaking ? 1 : 0.35;
      const auto = speaking ? 0.9 : 0.25;

      // level verilmezse otomatik dalgalansın
      const lv =
        typeof level === "number"
          ? Math.max(0, Math.min(1, level))
          : Math.max(0, Math.min(1, auto * (0.5 + 0.5 * Math.sin(now / 700))));

      // arka planı temizle
      ctx.clearRect(0, 0, w, h);

      // glow arka çizgiler
      const grad = ctx.createLinearGradient(0, cy, w, cy);
      grad.addColorStop(0, "rgba(80,200,255,0.0)");
      grad.addColorStop(0.25, "rgba(80,200,255,0.55)");
      grad.addColorStop(0.5, "rgba(255,120,220,0.65)");
      grad.addColorStop(0.75, "rgba(120,120,255,0.55)");
      grad.addColorStop(1, "rgba(120,120,255,0.0)");

      // çok katmanlı dalga
      const layers = [
        { width: 5, alpha: 0.25, k: 1.2, speed: 1.0 },
        { width: 3, alpha: 0.35, k: 1.6, speed: 1.25 },
        { width: 2, alpha: 0.6, k: 2.0, speed: 1.5 },
      ];

      const ampBase = (h * 0.18) * base;
      const amp = ampBase * (0.35 + 0.9 * lv);

      for (const L of layers) {
        ctx.beginPath();
        ctx.lineWidth = L.width;
        ctx.strokeStyle = `rgba(255,255,255,${L.alpha})`;
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(160,120,255,0.35)";

        for (let x = 0; x <= w; x += 2) {
          const nx = (x / w) * Math.PI * 2;

          // merkezde güçlü, kenarlara doğru sönüm
          const falloff = Math.pow(1 - Math.abs((x - cx) / cx), 1.8);

          // sin+harmonics + küçük jitter
          const y =
            Math.sin(nx * L.k + seed + now / (450 / L.speed)) * 0.7 +
            Math.sin(nx * (L.k * 0.5) + seed * 0.7 + now / (800 / L.speed)) * 0.3;

          const yy = cy + y * amp * falloff;

          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }

      // ana renkli hat
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = grad;
      ctx.shadowBlur = 22;
      ctx.shadowColor = "rgba(255,120,220,0.30)";

      for (let x = 0; x <= w; x += 2) {
        const nx = (x / w) * Math.PI * 2;
        const falloff = Math.pow(1 - Math.abs((x - cx) / cx), 2.0);

        const y =
          Math.sin(nx * 1.7 + seed + now / 420) * 0.6 +
          Math.sin(nx * 2.9 + seed * 0.3 + now / 310) * 0.25 +
          Math.sin(nx * 0.9 + seed * 0.8 + now / 650) * 0.15;

        const yy = cy + y * amp * falloff;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();

      // merkez parlama
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.35);
      rg.addColorStop(0, "rgba(255,140,220,0.15)");
      rg.addColorStop(0.6, "rgba(120,180,255,0.10)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [speaking, level, seed]);

  return <canvas ref={ref} className="h-full w-full" />;
}
