import { describe, expect, it } from "vitest";
import { PromptTemplates } from "../src/services/ai/PromptTemplates.js";

describe("PromptTemplates smoke", () => {
  const templates = new PromptTemplates();

  it("[UTC-03] includes a gentle redirect instruction for off-topic answers in supportive mode", () => {
    const instructions = templates.sessionInstructions({
      firstName: "Ada",
      gender: "Kadın",
      interviewType: "Technical",
      role: "Frontend Developer",
      companyOrIndustry: "Teknoloji",
      domain: "React",
      difficulty: "Junior",
      mode: "Supportive",
      candidateBrief: null,
    });

    expect(instructions).toContain("Aday sorudan saparsa");
    expect(instructions).toContain("Anlıyorum, peki soruya dönersek");
    expect(instructions).toContain("nazikçe");
  });

  it("[UAT-02] produces supportive interviewer instructions with gentle and encouraging guidance", () => {
    const instructions = templates.sessionInstructions({
      firstName: "Ada",
      gender: "Kadın",
      interviewType: "Technical",
      role: "Frontend Developer",
      companyOrIndustry: "Teknoloji",
      domain: "React",
      difficulty: "Junior",
      mode: "Supportive",
      candidateBrief: null,
    });

    expect(instructions).toContain("Supportive mod");
    expect(instructions).toContain("nazikçe");
    expect(instructions).toContain("motive edici");
    expect(instructions).not.toContain("hakaret");
    expect(instructions).not.toContain("küçümse");
  });

  it("[UAT-02] keeps transcript feedback recommendations constructive and action-oriented", () => {
    const prompt = templates.transcriptEvaluationSystemPrompt("Technical");

    expect(prompt).toContain("recommendations");
    expect(prompt).toContain("detail");
    expect(prompt).toContain("summary");
    expect(prompt).not.toContain("humiliate");
    expect(prompt).not.toContain("insult");
  });

  it("[FR-08] includes hidden time-management guidance in technical interview instructions", () => {
    const instructions = templates.sessionInstructions({
      firstName: "Ada",
      gender: "Kadın",
      interviewType: "Technical",
      role: "Frontend Developer",
      companyOrIndustry: "Teknoloji",
      domain: "React",
      difficulty: "Junior",
      mode: "Neutral",
      candidateBrief: null,
    });

    expect(instructions).toContain("ZAMAN YÖNETİMİ");
    expect(instructions).toContain("Her soru için kendi kendine 2-3 dakika hedefle");
    expect(instructions).toContain("süre uzarsa nazikçe toparlatıp sonraki soruya geç");
    expect(instructions).toContain("Kuracağın cümlenin içinde 'süre, dakika, saniye' gibi kelimeler KULLANMA");
  });

  it("[FR-08] includes hidden time-management guidance in HR interview instructions", () => {
    const instructions = templates.sessionInstructions({
      firstName: "Ada",
      gender: "Kadın",
      interviewType: "HR",
      role: "Product Manager",
      companyOrIndustry: "Teknoloji",
      domain: "Genel",
      difficulty: "Junior",
      mode: "Supportive",
      candidateBrief: null,
    });

    expect(instructions).toContain("ZAMAN YÖNETİMİ");
    expect(instructions).toContain("Her soru için kendi kendine 1-2 dakika hedefle");
    expect(instructions).toContain("süre uzarsa nazikçe toparlatıp sonraki soruya geç");
    expect(instructions).toContain("Kuracağın cümlenin içinde 'süre, dakika, saniye' gibi kelimeler KULLANMA");
  });
});
