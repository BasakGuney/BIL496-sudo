export type Gender = "Kadın" | "Erkek";
export type InterviewType = "HR" | "Technical";
export type Difficulty = "Junior" | "Intermediate";
export type Mode = "Supportive" | "Neutral";

export type SessionConfig = {
  firstName: string;
  lastName: string;
  gender: Gender;
  interviewType: InterviewType;
  role: string;
  companyOrIndustry: string;
  domainInterest: string;
  difficulty: Difficulty;
  mode: Mode;
  consent: {
    mic: boolean;
    camera: boolean;
  };
};

export type FeedbackMetric = {
  key: string;
  label: string;
  score: number;
  detail?: string;
};

export type FeedbackRecommendation = {
  title: string;
  text: string;
};

export type VisionAnalysis = {
  status: 'ready' | 'limited' | 'unavailable';
  source: string;
  supportiveOverlayUsed: boolean;
  overview: {
    sampledFrames: number;
    faceDetectedFrames: number;
    missingFaceFrames: number;
    savedSampleCount: number;
    facePresenceRatio: number;
    facePresenceScore: number;
    focusScore: number;
    centeringScore: number;
    steadinessScore: number;
    averageFaceAreaRatio: number;
    averageCenterOffset: number;
    headMovementRaw: number;
  };
  tension: {
    visualTensionScore: number;
    attentionRiskScore: number;
    movementRiskScore: number;
    eyeTensionScore: number;
    attentionDriftRatio: number;
    dangerFrameRatio: number;
    lowEyeRatio: number;
    warnFrames: number;
    dangerFrames: number;
    lowEyeFrames: number;
  };
  diagnostics?: {
    detector?: {
      requested?: string;
      used?: string;
      mediapipeAvailable?: boolean;
      pythonSupportedForMediapipe?: boolean;
      fallbackReason?: string | null;
      mediapipeImportError?: string | null;
      status?: string;
    } | null;
    lastSource?: string;
    savedSampleCount?: number;
  };
  samples: Array<{
    ts: number;
    frameIndex: number;
    hasFace: boolean;
    bbox: { x: number; y: number; width: number; height: number } | null;
    attentionLevel?: "ok" | "warn" | "danger";
    imageBase64?: string;
    imagePath?: string | null;
  }>;
  capturedAt: string;
};

export type ScoreMeta = {
  overall?: { label: string; min: number; max: number };
  audio?: { label: string; items: Record<string, { label: string; min: number; max: number; inverted?: boolean }> };
  vision?: { label: string; items: Record<string, { label: string; min: number; max: number; inverted?: boolean }> };
};

export type AudioLlmReport = {
  overallAnalysis?: string;
  clarityBadge?: string;
  dominantEmotion?: string;
  secondaryEmotion?: string | null;
  scores?: Array<{ label: string; score: number; detail: string }>;
  tonDistribution?: Array<{ label: string; score: number }>;
  speechSummary?: string[];
  recommendations?: {
    nextInterview?: string;
    performanceDevelopment?: string;
  };
} | null;

export type AudioAnalysisPayload = {
  model: {
    overall_emotions?: Record<string, number>;
    overall_clarity?: number;
    items?: Array<Record<string, unknown>>;
  } | null;
};

export type TranscriptAnalysisPayload = {
  overallScore?: number;
  content?: FeedbackMetric[];
  communication?: FeedbackMetric[];
  recommendations?: FeedbackRecommendation[];
  qaEvaluations?: Array<Record<string, unknown>>;
} | null;

export type VisionLlmAnalysisPayload = {
  generatedAt?: string;
  source?: string;
  visionAnalysisPath?: string;
  report?: {
    overallScore?: number;
    overallLabel?: string;
    overallAnalysis?: string;
    standardStatus?: string;
    riskPoint?: string;
    scores?: Array<{ key: string; label: string; score: number; detail: string }>;
    strengths?: string[];
    improvementAreas?: string[];
    recommendations?: {
      nextInterview?: string[];
      performanceDevelopment?: string[];
    };
  };
} | null;

export type FeedbackReport = {
  id?: string;
  sessionId: string;
  overallScore: number;
  notes?: string[];
  recommendations: FeedbackRecommendation[];
  content: FeedbackMetric[];
  communication: FeedbackMetric[];
  behavioral?: FeedbackMetric[];
  transcript?: Array<{ role: string; text: string; ts?: number }>;
  transcriptText?: string;
  visionAnalysis?: VisionAnalysis | null;
  audioAnalysis?: AudioAnalysisPayload;
  audioLlmReport?: AudioLlmReport;
  transcriptAnalysis?: TranscriptAnalysisPayload;
  visionLlmAnalysis?: VisionLlmAnalysisPayload;
  scoreMeta?: ScoreMeta | null;
  analysisStatus?: {
    audio?: boolean;
    audioLlm?: boolean;
    transcript?: boolean;
    vision?: boolean;
    visionLlm?: boolean;
    visionExpected?: boolean;
  };
  [key: string]: unknown;
};

export type CandidateAnswerAudio = {
  questionIndex: number;
  mimeType: string;
  startedAt: number;
  endedAt: number;
  audioBase64: string;
};
