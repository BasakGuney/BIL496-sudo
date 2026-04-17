import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionSetupForm } from "@/components/setup/SessionSetupForm";
import type { SessionConfig } from "@/lib/types";

const baseConfig: SessionConfig = {
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "Kadın",
  interviewType: "Technical",
  role: "Frontend Developer",
  companyOrIndustry: "Teknoloji",
  domainInterest: "React",
  difficulty: "Junior",
  mode: "Supportive",
  consent: {
    mic: false,
    camera: true,
  },
  cvFile: null,
  candidateBrief: null,
};

describe("SessionSetupForm smoke", () => {
  it("[STC-03][HIR-01] keeps the start action disabled until required consent is granted", () => {
    render(
      <SessionSetupForm
        value={baseConfig}
        onChange={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />
    );

    expect(
      screen.getByRole("button", { name: /eksik bilgileri tamamla/i })
    ).toBeDisabled();
  });
});
