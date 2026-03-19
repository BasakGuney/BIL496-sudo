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
  metrics: {
    sampledFrames: number;
    faceDetectedFrames: number;
    missingFaceFrames: number;
    averageFaceAreaRatio: number;
    headMovementRaw: number;
    visualTensionScore?: number;
    averageCenterOffset: number;
    warnFrames?: number;
    dangerFrames?: number;
    lowEyeFrames?: number;
  };
  summary: {
    facePresenceRatio: number;
    centeringScore: number;
    steadinessScore: number;
    averageFaceAreaRatio: number;
    headMovementRaw: number;
    visualTensionScore?: number;
  };
  notes: string[];
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
  [key: string]: unknown;
};

export type CandidateAnswerAudio = {
  questionIndex: number;
  mimeType: string;
  startedAt: number;
  endedAt: number;
  audioBase64: string;
};
