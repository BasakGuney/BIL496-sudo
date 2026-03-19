import type { CandidateAnswerAudio, FeedbackReport, SessionConfig } from "./types";

const BACKEND_URL = "http://localhost:3001";

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message)
        : `Request failed: ${response.status}`
    );
  }

  return payload;
}

export async function startSession(config: SessionConfig) {
  const payload = await request("/session", {
    method: "POST",
    body: JSON.stringify({
      firstName: config.firstName,
      lastName: config.lastName,
      gender: config.gender,
      interviewType: config.interviewType,
      role: config.role,
      companyOrIndustry: config.companyOrIndustry,
      domain: config.domainInterest,
      difficulty: config.difficulty,
      mode: config.mode,
    }),
  });

  return {
    sessionId: String((payload as any)?.sessionId || ""),
    previewQuestions: Array.isArray((payload as any)?.previewQuestions) ? (payload as any).previewQuestions : [],
  };
}

export async function uploadCandidateAnswerIncremental(sessionId: string, candidateAnswerAudio: CandidateAnswerAudio) {
  return request(`/session/${encodeURIComponent(sessionId)}/answer`, {
    method: "POST",
    body: JSON.stringify({ candidateAnswerAudio }),
  });
}

export async function endSession(
  sessionId: string,
  transcript: unknown[],
  candidateAnswerAudios: CandidateAnswerAudio[]
) {
  return request(`/session/${encodeURIComponent(sessionId)}/end`, {
    method: "POST",
    body: JSON.stringify({ transcript, candidateAnswerAudios }),
  }) as Promise<FeedbackReport>;
}

export async function getReport(sessionId: string) {
  return request(`/session/${encodeURIComponent(sessionId)}/report`, {
    method: "GET",
  }) as Promise<FeedbackReport>;
}
