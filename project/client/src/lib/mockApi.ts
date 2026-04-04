import type { CandidateAnswerAudio, SessionConfig } from "./types";
import { BACKEND_URL } from "./config";


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
        ? String(payload.message)
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
    sessionId: String(payload?.sessionId || ""),
    previewQuestions: Array.isArray(payload?.previewQuestions) ? payload.previewQuestions : [],
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
    body: JSON.stringify({
      transcript,
      candidateAnswerAudios,
    }),
  });
}
