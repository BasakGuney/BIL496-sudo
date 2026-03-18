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
  [key: string]: unknown;
};

export type CandidateAnswerAudio = {
  questionIndex: number;
  mimeType: string;
  startedAt: number;
  endedAt: number;
  audioBase64: string;
};
