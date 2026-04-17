export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisionOverlayState = {
  supported: boolean;
  detecting: boolean;
  hasFace: boolean;
  faceCount: number;
  box: FaceBox | null;
  message: string;
  imageWidth?: number;
  imageHeight?: number;
  attentionLevel?: "ok" | "warn" | "danger";
};

type StartOptions = {
  video: HTMLVideoElement;
  sessionId: string;
  backendBaseUrl: string;
  supportiveMode: boolean;
  sampleIntervalMs?: number;
  onOverlay?: (overlay: VisionOverlayState) => void;
};

function toBase64Data(dataUrl: string) {
  const [, base64 = ''] = dataUrl.split(',');
  return base64;
}

export function createVisionAnalyzer() {
  let timeoutId: number | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let onOverlay: ((overlay: VisionOverlayState) => void) | null = null;
  let stopRequested = false;
  let runToken = 0;
  let abortController: AbortController | null = null;
  let smoothedBox: FaceBox | null = null;
  let lastBoxSeenAt = 0;

  function scheduleNext(fn: () => void, delayMs: number) {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(fn, Math.max(0, delayMs));
  }

  function smoothBox(nextBox: FaceBox | null) {
    const now = Date.now();
    if (!nextBox) {
      if (smoothedBox && now - lastBoxSeenAt < 650) {
        return smoothedBox;
      }
      smoothedBox = null;
      return null;
    }

    lastBoxSeenAt = now;
    if (!smoothedBox) {
      smoothedBox = { ...nextBox };
      return smoothedBox;
    }

    const blend = (prev: number, next: number) => Math.round(prev + ((next - prev) * 0.55));
    smoothedBox = {
      x: blend(smoothedBox.x, nextBox.x),
      y: blend(smoothedBox.y, nextBox.y),
      width: blend(smoothedBox.width, nextBox.width),
      height: blend(smoothedBox.height, nextBox.height),
    };
    return smoothedBox;
  }

  async function start(options: StartOptions) {
    const {
      video,
      sessionId,
      backendBaseUrl,
      supportiveMode,
      sampleIntervalMs = 900,
      onOverlay: overlayHandler,
    } = options;

    stop();
    canvas = document.createElement('canvas');
    onOverlay = overlayHandler || null;
    stopRequested = false;
    runToken += 1;
    const currentRunToken = runToken;
    smoothedBox = null;
    lastBoxSeenAt = 0;
    let frameIndex = 0;

    onOverlay?.({
      supported: true,
      detecting: true,
      hasFace: false,
      faceCount: 0,
      box: null,
      message: 'Görüntü analizi başlatılıyor...',
    });

    const sampleFrame = async () => {
      if (stopRequested || currentRunToken !== runToken) return;
      if (!canvas || !video.videoWidth || !video.videoHeight) {
        scheduleNext(() => {
          void sampleFrame();
        }, 250);
        return;
      }
      frameIndex += 1;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        scheduleNext(() => {
          void sampleFrame();
        }, sampleIntervalMs);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = toBase64Data(canvas.toDataURL('image/jpeg', 0.82));

      try {
        abortController = new AbortController();
        const response = await fetch(`${backendBaseUrl}/session/${encodeURIComponent(sessionId)}/vision/frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            imageBase64,
            supportiveMode,
            frameIndex,
            ts: Date.now(),
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message || 'Vision frame request failed.');
        }

        const nextBox = smoothBox(payload?.box || null);
        onOverlay?.({
          supported: Boolean(payload?.supported ?? true),
          detecting: Boolean(payload?.detecting ?? true),
          hasFace: Boolean(nextBox),
          faceCount: Math.max(Number(payload?.faceCount || 0), nextBox ? 1 : 0),
          box: nextBox,
          message: String(payload?.message || 'Görüntü analizi hazır.'),
          imageWidth: Number(payload?.imageWidth || video.videoWidth || 0),
          imageHeight: Number(payload?.imageHeight || video.videoHeight || 0),
          attentionLevel: payload?.attentionLevel || 'ok',
        });
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        console.error('Vision frame upload failed', error);
        smoothedBox = null;
        onOverlay?.({
          supported: false,
          detecting: false,
          hasFace: false,
          faceCount: 0,
          box: null,
          message: 'Backend görüntü analizi şu an erişilemiyor.',
          imageWidth: video.videoWidth,
          imageHeight: video.videoHeight,
          attentionLevel: 'danger',
        });
      } finally {
        abortController = null;
        if (!stopRequested && currentRunToken === runToken) {
          scheduleNext(() => {
            void sampleFrame();
          }, sampleIntervalMs);
        }
      }
    };

    scheduleNext(() => {
      void sampleFrame();
    }, 100);
  }

  function stop() {
    stopRequested = true;
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    abortController?.abort();
    abortController = null;
    smoothedBox = null;
  }

  function buildPayload() {
    return null;
  }

  return { start, stop, buildPayload };
}
