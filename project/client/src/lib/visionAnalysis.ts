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
};

export type VisionSample = {
  ts: number;
  frameIndex: number;
  hasFace: boolean;
  bbox: FaceBox | null;
  imageBase64?: string;
};

export type VisionAnalysisPayload = {
  status: 'ready' | 'limited' | 'unavailable';
  source: string;
  supportiveOverlayUsed: boolean;
  metrics: {
    sampledFrames: number;
    faceDetectedFrames: number;
    missingFaceFrames: number;
    averageFaceAreaRatio: number;
    headMovementRaw: number;
    averageCenterOffset: number;
  };
  summary: {
    facePresenceRatio: number;
    centeringScore: number;
    steadinessScore: number;
    averageFaceAreaRatio: number;
    headMovementRaw: number;
  };
  notes: string[];
  samples: VisionSample[];
  capturedAt: string;
};

type DetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox?: DOMRectReadOnly } | { x?: number; y?: number; width?: number; height?: number }>>;
};

type StartOptions = {
  video: HTMLVideoElement;
  supportiveMode: boolean;
  sampleIntervalMs?: number;
  maxSamples?: number;
  onOverlay?: (overlay: VisionOverlayState) => void;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toBase64Data(dataUrl: string) {
  const [, base64 = ''] = dataUrl.split(',');
  return base64;
}

function normalizeBox(boxLike: any): FaceBox | null {
  if (!boxLike) return null;
  const src = boxLike.boundingBox || boxLike;
  const width = Number(src.width || 0);
  const height = Number(src.height || 0);
  if (width <= 0 || height <= 0) return null;
  return {
    x: Number(src.x || src.left || 0),
    y: Number(src.y || src.top || 0),
    width,
    height,
  };
}

function hasFaceDetector() {
  return typeof window !== 'undefined' && 'FaceDetector' in window;
}

async function createDetector(): Promise<DetectorLike | null> {
  if (!hasFaceDetector()) return null;
  const FaceDetectorCtor = (window as any).FaceDetector;
  return new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
}

export function createVisionAnalyzer() {
  let intervalId: number | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let detector: DetectorLike | null = null;
  let frameIndex = 0;
  let sampledFrames = 0;
  let faceDetectedFrames = 0;
  let totalFaceAreaRatio = 0;
  let totalCenterOffset = 0;
  let movementAccumulator = 0;
  let lastCenter: { x: number; y: number } | null = null;
  let supportMessage = 'Tarayıcı yüz algılama API desteği bekleniyor.';
  let samples: VisionSample[] = [];
  let onOverlay: ((overlay: VisionOverlayState) => void) | null = null;
  let supportiveMode = false;
  let maxSamples = 6;

  async function start(options: StartOptions) {
    const {
      video,
      supportiveMode: supportive,
      sampleIntervalMs = 1200,
      maxSamples: sampleCap = 6,
      onOverlay: overlayHandler,
    } = options;

    stop();
    onOverlay = overlayHandler || null;
    supportiveMode = supportive;
    maxSamples = sampleCap;
    detector = await createDetector();

    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    frameIndex = 0;
    sampledFrames = 0;
    faceDetectedFrames = 0;
    totalFaceAreaRatio = 0;
    totalCenterOffset = 0;
    movementAccumulator = 0;
    lastCenter = null;
    samples = [];

    if (!detector) {
      supportMessage = 'Bu tarayıcı FaceDetector API desteklemiyor; görüntü analizi sınırlı kalacak.';
      onOverlay?.({
        supported: false,
        detecting: false,
        hasFace: false,
        faceCount: 0,
        box: null,
        message: supportMessage,
      });
      return;
    }

    supportMessage = 'Yüz analizi aktif.';
    intervalId = window.setInterval(async () => {
      if (!video.videoWidth || !video.videoHeight || !canvas || !ctx || !detector) return;

      frameIndex += 1;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      sampledFrames += 1;

      try {
        const faces = await detector.detect(canvas as unknown as CanvasImageSource);
        const firstFace = normalizeBox(faces?.[0]);
        const hasFace = Boolean(firstFace);
        const faceCount = Array.isArray(faces) ? faces.length : 0;

        if (hasFace && firstFace) {
          faceDetectedFrames += 1;
          const centerX = firstFace.x + firstFace.width / 2;
          const centerY = firstFace.y + firstFace.height / 2;
          const normalizedCenterOffset = Math.sqrt(
            Math.pow((centerX / canvas.width) - 0.5, 2) + Math.pow((centerY / canvas.height) - 0.5, 2)
          );
          totalCenterOffset += normalizedCenterOffset;
          totalFaceAreaRatio += (firstFace.width * firstFace.height) / (canvas.width * canvas.height);

          if (lastCenter) {
            movementAccumulator += Math.sqrt(
              Math.pow((centerX - lastCenter.x) / canvas.width, 2) + Math.pow((centerY - lastCenter.y) / canvas.height, 2)
            );
          }
          lastCenter = { x: centerX, y: centerY };

          if (samples.length < maxSamples) {
            const previewCanvas = document.createElement('canvas');
            const previewCtx = previewCanvas.getContext('2d');
            if (previewCtx) {
              previewCanvas.width = Math.max(1, Math.round(firstFace.width));
              previewCanvas.height = Math.max(1, Math.round(firstFace.height));
              previewCtx.drawImage(
                video,
                firstFace.x,
                firstFace.y,
                firstFace.width,
                firstFace.height,
                0,
                0,
                previewCanvas.width,
                previewCanvas.height
              );
              samples.push({
                ts: Date.now(),
                frameIndex,
                hasFace: true,
                bbox: firstFace,
                imageBase64: toBase64Data(previewCanvas.toDataURL('image/jpeg', 0.82)),
              });
            }
          }
        }

        onOverlay?.({
          supported: true,
          detecting: true,
          hasFace,
          faceCount,
          box: supportiveMode ? firstFace : null,
          message: hasFace ? 'Yüz algılandı.' : 'Yüz bulunamadı. Kameraya hizalanın.',
        });
      } catch (error) {
        console.error('Vision detection failed', error);
        supportMessage = 'Yüz algılama sırasında hata oluştu; görüntü analizi sınırlı kalacak.';
        onOverlay?.({
          supported: true,
          detecting: false,
          hasFace: false,
          faceCount: 0,
          box: null,
          message: supportMessage,
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

  function buildPayload(): VisionAnalysisPayload {
    const facePresenceRatio = sampledFrames > 0 ? faceDetectedFrames / sampledFrames : 0;
    const averageFaceAreaRatio = faceDetectedFrames > 0 ? totalFaceAreaRatio / faceDetectedFrames : 0;
    const averageCenterOffset = faceDetectedFrames > 0 ? totalCenterOffset / faceDetectedFrames : 1;
    const headMovementRaw = Math.max(0, movementAccumulator);
    const centeringScore = clamp((1 - Math.min(averageCenterOffset, 0.75) / 0.75) * 100);
    const steadinessScore = clamp((1 - Math.min(headMovementRaw, 1.25) / 1.25) * 100);

    const notes: string[] = [];
    let status: VisionAnalysisPayload['status'] = 'ready';

    if (!hasFaceDetector()) {
      status = 'limited';
      notes.push('Tarayıcı FaceDetector API desteklemediği için görüntü analizi sınırlı kaldı.');
    }
    if (sampledFrames === 0) {
      status = 'unavailable';
      notes.push('Kamera görüntüsünden yeterli frame örneklenemedi.');
    } else if (facePresenceRatio < 0.4) {
      notes.push('Yüz görünürlüğü düşük kaldı; kamera hizası veya ışık iyileştirilebilir.');
    } else {
      notes.push('Yüz görünürlüğü analiz için yeterli seviyedeydi.');
    }

    if (supportiveMode) {
      notes.push('Supportive modda canlı yüz çerçevesi gösterildi.');
    }

    return {
      status,
      source: 'browser-face-detector',
      supportiveOverlayUsed: supportiveMode,
      metrics: {
        sampledFrames,
        faceDetectedFrames,
        missingFaceFrames: Math.max(0, sampledFrames - faceDetectedFrames),
        averageFaceAreaRatio: Number(averageFaceAreaRatio.toFixed(4)),
        headMovementRaw: Number(headMovementRaw.toFixed(4)),
        averageCenterOffset: Number(averageCenterOffset.toFixed(4)),
      },
      summary: {
        facePresenceRatio: Number(facePresenceRatio.toFixed(4)),
        centeringScore: Number(centeringScore.toFixed(0)),
        steadinessScore: Number(steadinessScore.toFixed(0)),
        averageFaceAreaRatio: Number(averageFaceAreaRatio.toFixed(4)),
        headMovementRaw: Number(headMovementRaw.toFixed(4)),
      },
      notes,
      samples,
      capturedAt: new Date().toISOString(),
    };
  }

  return { start, stop, buildPayload };
}
