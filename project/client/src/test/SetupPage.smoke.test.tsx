import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SetupPage } from "@/pages/SetupPage";

vi.mock("@/lib/api", () => ({
  startSession: vi.fn(),
}));

import { startSession } from "@/lib/api";

describe("SetupPage smoke", () => {
  beforeEach(() => {
    vi.mocked(startSession).mockReset();
  });

  it("[ITC-01] submits setup and forwards the prepared session", async () => {
    vi.mocked(startSession).mockResolvedValue({
      sessionId: "S-123",
      previewQuestions: [],
      candidateBrief: null,
    });

    const onPrepared = vi.fn();

    render(<SetupPage onPrepared={onPrepared} />);

    fireEvent.click(screen.getByRole("button", { name: /mülakatı hazırla/i }));

    await waitFor(() => {
      expect(startSession).toHaveBeenCalledTimes(1);
      expect(onPrepared).toHaveBeenCalledWith(
        expect.objectContaining({ role: "Frontend Developer", mode: "Supportive" }),
        "S-123"
      );
    });
  });

  it("[NFR-03] shows the backend error when session preparation fails", async () => {
    vi.mocked(startSession).mockRejectedValue(new Error("Kurulum servisi gecici olarak kullanılamıyor."));

    render(<SetupPage onPrepared={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /mülakatı hazırla/i }));

    await waitFor(() => {
      expect(screen.getByText("Kurulum servisi gecici olarak kullanılamıyor.")).toBeInTheDocument();
    });
  });
});
