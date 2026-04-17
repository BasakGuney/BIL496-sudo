import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPage } from "@/pages/PreviewPage";
import type { SessionConfig } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  generatePreviewQuestions: vi.fn(),
  updateSessionConfig: vi.fn(),
}));

import { generatePreviewQuestions, updateSessionConfig } from "@/lib/api";

const config: SessionConfig = {
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "Kadın",
  interviewType: "Technical",
  role: "Frontend Developer",
  companyOrIndustry: "Teknoloji",
  domainInterest: "React",
  difficulty: "Junior",
  mode: "Supportive",
  consent: { mic: true, camera: true },
  cvFile: null,
  candidateBrief: null,
};

describe("PreviewPage smoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(generatePreviewQuestions).mockReset();
    vi.mocked(updateSessionConfig).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("[ITC-02] loads and renders preview questions consistent with the session config", async () => {
    vi.mocked(generatePreviewQuestions).mockResolvedValue([
      "React performansını iyileştirmek için hangi teknikleri kullanırsın?",
      "Bir component ağacında state yönetimini nasıl kurgularsın?",
    ]);

    render(
      <PreviewPage
        config={config}
        sessionId="S-200"
        setConfig={vi.fn()}
        onStartInterview={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(generatePreviewQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        interviewType: "Technical",
        role: "Frontend Developer",
        difficulty: "Junior",
      })
    );
    expect(screen.getByText("React performansını iyileştirmek için hangi teknikleri kullanırsın?")).toBeInTheDocument();
    expect(screen.getByText("Bir component ağacında state yönetimini nasıl kurgularsın?")).toBeInTheDocument();
  });

  it("[ITC-02][STC-04] updates the session config and starts the interview when the user continues", async () => {
    vi.mocked(generatePreviewQuestions).mockResolvedValue(["Örnek soru"]);
    vi.mocked(updateSessionConfig).mockResolvedValue(null);

    const onStartInterview = vi.fn();

    render(
      <PreviewPage
        config={config}
        sessionId="S-200"
        setConfig={vi.fn()}
        onStartInterview={onStartInterview}
        onBack={vi.fn()}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByRole("button", { name: /mülakata başla/i })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /mülakata başla/i }));
    });

    expect(updateSessionConfig).toHaveBeenCalledWith("S-200", config);
    expect(onStartInterview).toHaveBeenCalledTimes(1);
  });

  it("[STC-04] returns to setup when the user clicks back", async () => {
    vi.mocked(generatePreviewQuestions).mockResolvedValue(["Örnek soru"]);

    const onBack = vi.fn();

    render(
      <PreviewPage
        config={config}
        sessionId="S-200"
        setConfig={vi.fn()}
        onStartInterview={vi.fn()}
        onBack={onBack}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /kuruluma dön/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
