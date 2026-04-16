export type Gender = "Kadın" | "Erkek";
export type InterviewType = "HR" | "Technical";
export type Difficulty = "Junior" | "Intermediate";
export type Mode = "Supportive" | "Neutral";

export type CandidateBrief = {
  headline: string;
  summary: string;
  technicalSummary: string;
  hrSummary: string;
  educationHighlights: string[];
  experienceHighlights: string[];
  projectHighlights: string[];
  skillHighlights: string[];
  hrExperienceHighlights: string[];
  hrFocusHighlights: string[];
};

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
  cvFile: {
    name: string;
    mimeType: string;
    dataBase64: string;
  } | null;
  candidateBrief?: CandidateBrief | null;
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
  overallScore?: number;
  overallAnalysis?: string;
  clarityBadge?: string;
  dominantEmotion?: string;
  secondaryEmotion?: string | null;
  completed?: boolean;
  generatedAt?: string;
  updatedAt?: string;
  status?: string;
  scores?: Array<{ label: string; score: number; detail: string }>;
  tonDistribution?: Array<{ label: string; score: number }>;
  speechSummary?: string[];
  perQuestionReports?: Array<{
    questionIndex: number;
    fileName?: string;
    relativePath?: string;
    analyzedAt?: string;
    summary?: string;
    metrics?: {
      durationSec?: number;
      clarity?: number;
      avgWpm?: number;
      pauseRatio?: number;
      pureSpeechTime?: number;
    };
    dominantEmotion?: {
      key?: string;
      label?: string;
      score?: number;
    } | null;
    secondaryEmotion?: {
      key?: string;
      label?: string;
      score?: number;
    } | null;
    scores?: {
      clarity?: number;
      pacing?: number;
      fluency?: number;
      emotionalBalance?: number;
    };
  }>;
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
  tokenUsage?: {
    previewQuestions?: { prompt: number; completion: number };
    liveHints?: { prompt: number; completion: number };
    liveFeedback?: { prompt: number; completion: number };
    transcriptEvaluation?: { prompt: number; completion: number };
    audioLlmInterpretation?: { prompt: number; completion: number };
    visionLlmReport?: { prompt: number; completion: number };
    realtimeApi?: {
      inputTokens: number;
      outputTokens: number;
      audioInputSeconds: number;
      audioOutputSeconds: number;
    };
  } | null;
  estimatedCost?: {
    currency?: string;
    total?: number;
    breakdown?: Record<string, number>;
  } | null;
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

export type SessionSummary = {
  sessionId: string;
  createdAt: string;
  overallScore: number | null;
  hasTranscript: boolean;
  hasAudio: boolean;
  hasVision: boolean;
  transcriptPreview: string;
  sessionConfig?: {
    role?: string;
    mode?: Mode;
    interviewType?: InterviewType;
  } | null;
};

export type HistoryInsights = {
  recentReports: Array<{
    sessionId: string;
    createdAt: string;
    overallScore: number;
    transcriptOverallScore: number;
    strengths: string[];
    improvementAreas: string[];
    focusTopics: string[];
  }>;
  trendMetrics: Array<{
    tag: string;
    label: string;
    scores: number[];
    latestScore: number;
    delta: number;
  }>;
  commentary: {
    weeklyWin: string;
    strongestArea: string;
    priorityFocus: string;
  };
};
