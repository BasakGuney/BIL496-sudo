export type InterviewType = "HR" | "Technical";
export type Difficulty = "Junior" | "Intermediate";
export type Mode = "Supportive" | "Neutral";
export type Gender = "Female" | "Male" | "Unspecified";

export type ConsentState = {
  mic: boolean;
  camera: boolean;
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
  consent: ConsentState;
};

export type InterviewTurn = {
  id: string;
  questionText: string;
};

export type FeedbackMetric = {
  key: string;
  label: string;
  score: number;
  detail?: string;
};

export type FeedbackReport = {
  sessionId: string;
  overallScore: number;
  content: FeedbackMetric[];
  communication: FeedbackMetric[];
  behavioral?: FeedbackMetric[];
  recommendations: { title: string; text: string }[];
  notes?: string[];
};
