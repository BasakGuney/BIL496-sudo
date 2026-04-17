import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND_URL } from "@/lib/config";
import { startSession } from "@/lib/api";
import type { SessionConfig } from "@/lib/types";

const config: SessionConfig = {
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "Kadın",
  interviewType: "Technical",
  role: "Frontend Developer",
  companyOrIndustry: "Teknoloji",
  domainInterest: "React",
  difficulty: "Junior",
  mode: "Neutral",
  consent: { mic: true, camera: true },
  cvFile: null,
  candidateBrief: null,
};

describe("client api smoke", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes session creation through the backend API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "S-77", previewQuestions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await startSession(config);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/session`,
      expect.objectContaining({ method: "POST" })
    );
  });
});
