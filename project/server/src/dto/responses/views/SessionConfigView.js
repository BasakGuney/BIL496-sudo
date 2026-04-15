export class SessionConfigView {
  static fromConfig(config) {
    return {
      interviewType: config?.interviewType || "HR",
      role: config?.role || "",
      domain: config?.domain || "",
      difficulty: config?.difficulty || "Junior",
      mode: config?.mode || "Neutral",
      cvUploaded: Boolean(config?.cvFile?.dataBase64),
      candidateBrief: config?.candidateBrief || null,
    };
  }
}
