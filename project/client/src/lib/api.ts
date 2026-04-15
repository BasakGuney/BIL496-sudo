import type { CandidateAnswerAudio, CandidateBrief, FeedbackReport, SessionConfig, SessionSummary } from "./types";
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
        ? String((payload as { message?: string }).message)
        : `Request failed: ${response.status}`
    );
  }

  return payload;
}


function isReportReady(report: FeedbackReport | null | undefined) {
  if (!report) return false;
  const status = report.analysisStatus || {};
  return Boolean(
    status.audio
    && status.audioLlm
    && status.transcript
    && (!status.vision || status.visionLlm)
  );
}

export async function waitForReadyReport(sessionId: string, { maxAttempts = 24, delayMs = 2500 } = {}) {
  let latest: FeedbackReport | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    latest = await getReport(sessionId);
    if (isReportReady(latest)) {
      return latest;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  return latest;
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
      cvFile: config.cvFile,
    }),
  });

  return {
    sessionId: String((payload as any)?.sessionId || ""),
    previewQuestions: Array.isArray((payload as any)?.previewQuestions) ? (payload as any).previewQuestions : [],
    candidateBrief: (((payload as any)?.config?.candidateBrief || null) as CandidateBrief | null),
  };
}

export async function generatePreviewQuestions(config: SessionConfig) {
  const payload = await request("/preview-questions", {
    method: "POST",
    body: JSON.stringify({
      interviewType: config.interviewType,
      role: config.role,
      companyOrIndustry: config.companyOrIndustry,
      domain: config.domainInterest,
      difficulty: config.difficulty,
      candidateBrief: config.candidateBrief || null,
    }),
  });

  return Array.isArray((payload as any)?.questions) ? (payload as any).questions : [];
}

export async function updateSessionConfig(sessionId: string, config: SessionConfig) {
  const payload = await request(`/session/${encodeURIComponent(sessionId)}/config`, {
    method: "PATCH",
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
      candidateBrief: config.candidateBrief || null,
    }),
  });

  return (((payload as any)?.config?.candidateBrief || null) as CandidateBrief | null);
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

export async function listReports(limit = 50) {
  const payload = await request(`/reports?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
  });
  return Array.isArray((payload as any)?.items) ? (payload as any).items as SessionSummary[] : [];
}
