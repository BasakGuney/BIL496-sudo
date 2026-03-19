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
  let intervalId: number | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let onOverlay: ((overlay: VisionOverlayState) => void) | null = null;

  async function start(options: StartOptions) {
    const {
      video,
      sessionId,
      backendBaseUrl,
      supportiveMode,
      sampleIntervalMs = 1200,
      onOverlay: overlayHandler,
    } = options;

    stop();
    canvas = document.createElement('canvas');
    onOverlay = overlayHandler || null;
    let frameIndex = 0;

    onOverlay?.({
      supported: true,
      detecting: true,
      hasFace: false,
      faceCount: 0,
      box: null,
      message: 'Görüntü analizi başlatılıyor...',
    });

    intervalId = window.setInterval(async () => {
      if (!canvas || !video.videoWidth || !video.videoHeight) return;
      frameIndex += 1;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = toBase64Data(canvas.toDataURL('image/jpeg', 0.82));

      try {
        const response = await fetch(`${backendBaseUrl}/session/${encodeURIComponent(sessionId)}/vision/frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

        onOverlay?.({
          supported: Boolean(payload?.supported ?? true),
          detecting: Boolean(payload?.detecting ?? true),
          hasFace: Boolean(payload?.hasFace),
          faceCount: Number(payload?.faceCount || 0),
          box: payload?.box || null,
          message: String(payload?.message || 'Görüntü analizi hazır.'),
          imageWidth: Number(payload?.imageWidth || video.videoWidth || 0),
          imageHeight: Number(payload?.imageHeight || video.videoHeight || 0),
        });
      } catch (error) {
        console.error('Vision frame upload failed', error);
        onOverlay?.({
          supported: false,
          detecting: false,
          hasFace: false,
          faceCount: 0,
          box: null,
          message: 'Backend görüntü analizi şu an erişilemiyor.',
          imageWidth: video.videoWidth,
          imageHeight: video.videoHeight,
        });
      }
    }, sampleIntervalMs);
  }

  function stop() {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  function buildPayload() {
    return null;
  }

  return { start, stop, buildPayload };
}
