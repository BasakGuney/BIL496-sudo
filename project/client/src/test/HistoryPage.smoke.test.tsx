import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryPage } from "@/pages/HistoryPage";
import type { FeedbackReport, HistoryInsights, SessionSummary } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  listReports: vi.fn(),
  getHistoryInsights: vi.fn(),
  getReport: vi.fn(),
}));

vi.mock("recharts", () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const chartShell = () => <div data-testid="chart-shell" />;
  return {
    ResponsiveContainer: passthrough,
    LineChart: chartShell,
    PieChart: chartShell,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Line: () => null,
    Pie: chartShell,
    Cell: () => null,
  };
});

import { getHistoryInsights, getReport, listReports } from "@/lib/api";

const reports: SessionSummary[] = [
  {
    sessionId: "S-100",
    createdAt: "2026-04-17T15:30:00.000Z",
    overallScore: 84,
    hasTranscript: true,
    hasAudio: true,
    hasVision: false,
    transcriptPreview: "React performansı hakkında konuştuk.",
    sessionConfig: {
      role: "Frontend Developer",
      mode: "Supportive",
      interviewType: "Technical",
    },
  },
];

const insights: HistoryInsights = {
  recentReports: [
    {
      sessionId: "S-100",
      createdAt: "2026-04-17T15:30:00.000Z",
      overallScore: 84,
      transcriptOverallScore: 82,
      strengths: ["Net anlatım"],
      improvementAreas: ["Somut örnekler"],
      focusTopics: ["Problem çözme"],
    },
  ],
  trendMetrics: [
    {
      tag: "clarity",
      label: "İfade Netliği",
      scores: [70, 78, 82],
      latestScore: 82,
      delta: 4,
    },
  ],
  commentary: {
    weeklyWin: "Yanıtların daha yapılandırılmış hale geldi.",
    strongestArea: "İfade Netliği",
    priorityFocus: "Örnekleri daha somutlaştır.",
  },
};

const reportMeta: FeedbackReport = {
  sessionId: "S-100",
  overallScore: 84,
  recommendations: [],
  content: [],
  communication: [],
  behavioral: [],
  transcript: [],
  transcriptText: "",
  audioAnalysis: { model: null },
  audioLlmReport: null,
  transcriptAnalysis: null,
  visionLlmAnalysis: null,
  analysisStatus: {},
  sessionConfig: {
    role: "Frontend Developer",
    mode: "Supportive",
    interviewType: "Technical",
  },
};

describe("HistoryPage smoke", () => {
  beforeEach(() => {
    vi.mocked(listReports).mockReset();
    vi.mocked(getHistoryInsights).mockReset();
    vi.mocked(getReport).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("[UAT-01] loads session history and opens the selected report", async () => {
    vi.mocked(listReports).mockResolvedValue(reports);
    vi.mocked(getHistoryInsights).mockResolvedValue(insights);
    vi.mocked(getReport).mockResolvedValue(reportMeta);

    const onOpenReport = vi.fn();

    render(<HistoryPage onOpenReport={onOpenReport} />);

    await waitFor(() => {
      expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
      expect(screen.getByText("84 / 100")).toBeInTheDocument();
      expect(screen.getByText("Yanıtların daha yapılandırılmış hale geldi.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Raporu İncele"));

    expect(onOpenReport).toHaveBeenCalledWith("S-100");
    expect(listReports).toHaveBeenCalledWith();
    expect(getHistoryInsights).toHaveBeenCalledWith(3);
    expect(getReport).toHaveBeenCalledWith("S-100");
  });
});
