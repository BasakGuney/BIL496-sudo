export class SessionConfigView {
  static fromConfig(config) {
    return {
      firstName: config?.firstName || "",
      lastName: config?.lastName || "",
      gender: config?.gender || "Erkek",
      interviewType: config?.interviewType || "HR",
      role: config?.role || "",
      companyOrIndustry: config?.companyOrIndustry || "",
      domain: config?.domain || "",
      difficulty: config?.difficulty || "Junior",
      mode: config?.mode || "Neutral",
      cvUploaded: Boolean(config?.cvFile?.dataBase64),
      candidateBrief: config?.candidateBrief || null,
    };
  }
}
