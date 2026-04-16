import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { PDFParse } from "pdf-parse";

export class FileReportArchive {
  constructor({ baseDir, persistVisionJpegs = false }) {
    this.baseDir = baseDir;
    this.persistVisionJpegs = Boolean(persistVisionJpegs);
    this.pythonBin = process.env.PYTHON_BIN || "python3";
    this.cvTranslatorScriptPath = path.resolve(process.cwd(), "src/services/analysis/python_api/cv_translator.py");
  }

  sanitizeSessionId(sessionId) {
    return String(sessionId || "unknown-session").replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  buildSessionFolderName(sessionId) {
    const safeSessionId = this.sanitizeSessionId(sessionId);
    return safeSessionId.startsWith("S-") ? safeSessionId : `S-${safeSessionId}`;
  }

  extensionFromMimeType(mimeType = "") {
    const clean = String(mimeType || "").toLowerCase();
    if (clean.includes("ogg")) return "ogg";
    if (clean.includes("mpeg") || clean.includes("mp3")) return "mp3";
    if (clean.includes("wav")) return "wav";
    if (clean.includes("mp4") || clean.includes("m4a")) return "m4a";
    return "webm";
  }

  normalizeCandidateAnswerAudios(candidateAnswerAudios = []) {
    return (Array.isArray(candidateAnswerAudios) ? candidateAnswerAudios : [])
      .map((item) => ({
        questionIndex: Number(item?.questionIndex || 0),
        mimeType: String(item?.mimeType || "audio/webm"),
        startedAt: Number(item?.startedAt || Date.now()),
        endedAt: Number(item?.endedAt || Date.now()),
        audioBase64: String(item?.audioBase64 || ""),
      }))
      .filter((item) => item.questionIndex > 0 && item.audioBase64.length > 0);
  }

  normalizeVisionAnalysis(visionAnalysis = null) {
    if (!visionAnalysis || typeof visionAnalysis !== "object") return null;

    const samples = (Array.isArray(visionAnalysis.samples) ? visionAnalysis.samples : [])
      .map((sample, index) => ({
        index: index + 1,
        ts: Number(sample?.ts || 0),
        frameIndex: Number(sample?.frameIndex || 0),
        hasFace: Boolean(sample?.hasFace),
        bbox: sample?.bbox && typeof sample.bbox === "object"
          ? {
              x: Number(sample.bbox.x || 0),
              y: Number(sample.bbox.y || 0),
              width: Number(sample.bbox.width || 0),
              height: Number(sample.bbox.height || 0),
            }
          : null,
        attentionLevel: String(sample?.attentionLevel || "ok"),
        imageBase64: String(sample?.imageBase64 || ""),
      }));

    return {
      status: String(visionAnalysis.status || "unavailable"),
      source: String(visionAnalysis.source || "browser-face-detector"),
      supportiveOverlayUsed: Boolean(visionAnalysis.supportiveOverlayUsed),
      overview: {
        sampledFrames: Number(visionAnalysis?.overview?.sampledFrames || 0),
        faceDetectedFrames: Number(visionAnalysis?.overview?.faceDetectedFrames || 0),
        missingFaceFrames: Number(visionAnalysis?.overview?.missingFaceFrames || 0),
        savedSampleCount: Number(visionAnalysis?.overview?.savedSampleCount || samples.length || 0),
        facePresenceRatio: Number(visionAnalysis?.overview?.facePresenceRatio || 0),
        facePresenceScore: Number(visionAnalysis?.overview?.facePresenceScore || 0),
        focusScore: Number(visionAnalysis?.overview?.focusScore || 0),
        centeringScore: Number(visionAnalysis?.overview?.centeringScore || 0),
        steadinessScore: Number(visionAnalysis?.overview?.steadinessScore || 0),
        averageFaceAreaRatio: Number(visionAnalysis?.overview?.averageFaceAreaRatio || 0),
        averageCenterOffset: Number(visionAnalysis?.overview?.averageCenterOffset || 0),
        headMovementRaw: Number(visionAnalysis?.overview?.headMovementRaw || 0),
      },
      tension: {
        visualTensionScore: Number(visionAnalysis?.tension?.visualTensionScore || 0),
        attentionRiskScore: Number(visionAnalysis?.tension?.attentionRiskScore || 0),
        movementRiskScore: Number(visionAnalysis?.tension?.movementRiskScore || 0),
        eyeTensionScore: Number(visionAnalysis?.tension?.eyeTensionScore || 0),
        attentionDriftRatio: Number(visionAnalysis?.tension?.attentionDriftRatio || 0),
        dangerFrameRatio: Number(visionAnalysis?.tension?.dangerFrameRatio || 0),
        lowEyeRatio: Number(visionAnalysis?.tension?.lowEyeRatio || 0),
        warnFrames: Number(visionAnalysis?.tension?.warnFrames || 0),
        dangerFrames: Number(visionAnalysis?.tension?.dangerFrames || 0),
        lowEyeFrames: Number(visionAnalysis?.tension?.lowEyeFrames || 0),
      },
      diagnostics: visionAnalysis?.diagnostics && typeof visionAnalysis.diagnostics === "object"
        ? {
            detector: visionAnalysis.diagnostics.detector || null,
            lastSource: String(visionAnalysis.diagnostics.lastSource || ""),
            savedSampleCount: Number(visionAnalysis.diagnostics.savedSampleCount || samples.length || 0),
          }
        : {
            detector: null,
            lastSource: String(visionAnalysis.source || ""),
            savedSampleCount: samples.length,
          },
      samples,
      capturedAt: String(visionAnalysis.capturedAt || new Date().toISOString()),
    };
  }

  buildAnswerFileName(answer = {}, sequence = null) {
    const ext = this.extensionFromMimeType(answer?.mimeType);
    const index = Number(sequence || 1);
    return `answer_${String(index).padStart(2, "0")}.${ext}`;
  }

  async ensureSessionDir(sessionId) {
    await mkdir(this.baseDir, { recursive: true });
    const sessionDir = path.join(this.baseDir, this.buildSessionFolderName(sessionId));
    await mkdir(sessionDir, { recursive: true });
    return sessionDir;
  }

  async saveSessionConfig({ sessionId, sessionConfig = null }) {
    if (!sessionId) return null;

    const sessionDir = await this.ensureSessionDir(sessionId);
    const payload = {
      role: String(sessionConfig?.role || "").trim(),
      mode: String(sessionConfig?.mode || "Neutral").trim(),
      interviewType: String(sessionConfig?.interviewType || "HR").trim(),
    };

    const relativePath = "session_config.json";
    await writeFile(path.join(sessionDir, relativePath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    const cvDir = path.join(sessionDir, "cv");
    await mkdir(cvDir, { recursive: true });
    const cvRelativePath = path.join("cv", "session_config.json");
    await writeFile(path.join(sessionDir, cvRelativePath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    return {
      ...payload,
      relativePath,
      cvRelativePath,
    };
  }

  sanitizeFileName(fileName = "cv.pdf") {
    const cleaned = String(fileName || "cv.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
  }

  repairTurkishPdfArtifacts(text = "") {
    const clean = String(text || "");
    if (!clean) return "";

    const replacements = [
      { base: "c", marker: "¸", out: "ç" },
      { base: "C", marker: "¸", out: "Ç" },
      { base: "s", marker: "¸", out: "ş" },
      { base: "S", marker: "¸", out: "Ş" },
      { base: "g", marker: "˘", out: "ğ" },
      { base: "G", marker: "˘", out: "Ğ" },
      { base: "u", marker: "¨", out: "ü" },
      { base: "U", marker: "¨", out: "Ü" },
      { base: "o", marker: "¨", out: "ö" },
      { base: "O", marker: "¨", out: "Ö" },
      { base: "I", marker: "˙", out: "İ" },
      { base: "i", marker: "˙", out: "i" },
    ];

    let repaired = clean;
    for (const { base, marker, out } of replacements) {
      const previousPattern = new RegExp(`${base}\\s*${marker}`, "gu");
      const nextPattern = new RegExp(`${marker}\\s*${base}`, "gu");
      repaired = repaired.replace(previousPattern, out).replace(nextPattern, out);
    }

    return repaired
      .replace(/[¨¸˘˙]/gu, "")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([(\[{])\s+/g, "$1")
      .replace(/\s+([)\]}])/g, "$1");
  }

  normalizeExtractedPdfText(text = "") {
    return this.repairTurkishPdfArtifacts(
      String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim()
    );
  }

  shouldTranslateCvText(text = "") {
    const clean = String(text || "").trim();
    if (clean.length < 80) return false;

    const lowered = ` ${clean.toLowerCase()} `;
    const englishMarkers = [
      " experience ",
      " education ",
      " skills ",
      " projects ",
      " work ",
      " developed ",
      " managed ",
      "responsible",
      "university",
      "engineer",
      "intern",
      "summary",
      "profile",
    ];
    const turkishMarkers = [
      " deneyim ",
      " egitim ",
      " eğitim ",
      " beceri ",
      " projeler ",
      " universite ",
      " üniversite ",
      " muhendis ",
      " mühendis ",
      " staj ",
      " ozet ",
      " özet ",
    ];

    const englishHits = englishMarkers.filter((marker) => lowered.includes(marker)).length;
    const turkishHits = turkishMarkers.filter((marker) => lowered.includes(marker)).length;
    const nonAsciiCount = [...clean].filter((char) => char.charCodeAt(0) > 127).length;

    return englishHits >= 2 && englishHits >= turkishHits && nonAsciiCount < Math.max(8, clean.length * 0.02);
  }

  async extractTextFromPdfBuffer(pdfBuffer) {
    if (!pdfBuffer || pdfBuffer.length === 0) return "";

    let parser = null;
    try {
      parser = new PDFParse({ data: pdfBuffer });
      const parsed = await parser.getText();
      return this.normalizeExtractedPdfText(parsed?.text || "");
    } catch (error) {
      console.warn("CV PDF text extraction failed:", error?.message || error);
      return "";
    } finally {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
    }
  }

  async runCvTranslator(text = "") {
    return new Promise((resolve) => {
      const child = spawn(this.pythonBin, [this.cvTranslatorScriptPath], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finalize = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        finalize({ ok: false, translatedText: "", error: error.message });
      });
      child.on("close", () => {
        if (!stdout.trim()) {
          finalize({ ok: false, translatedText: "", error: stderr.trim() || "translator returned no output" });
          return;
        }

        try {
          finalize(JSON.parse(stdout));
        } catch {
          finalize({ ok: false, translatedText: "", error: stderr.trim() || "translator returned invalid json" });
        }
      });

      try {
        child.stdin.write(JSON.stringify({ text }));
        child.stdin.end();
      } catch (error) {
        finalize({ ok: false, translatedText: "", error: error.message });
      }
    });
  }

  async translateCvTextToTurkish(text = "") {
    const clean = String(text || "").trim();
    if (!this.shouldTranslateCvText(clean)) return "";

    try {
      const result = await this.runCvTranslator(clean);
      if (!result?.ok) {
        throw new Error(result?.error || "translation failed");
      }
      return this.normalizeExtractedPdfText(result?.translatedText || "");
    } catch (error) {
      console.warn("CV Turkish translation failed:", error?.message || error);
      return "";
    }
  }

  createEmptyCvJson({ sourceFile = "cv.txt" } = {}) {
    return {
      candidate: {
        fullName: "",
        title: "",
        summary: "",
      },
      education: [],
      experience: {
        totalCount: 0,
        internCount: 0,
        professionalCount: 0,
        professional: [],
        intern: [],
      },
      projects: [],
      activities: [],
      skills: {
        technical: [],
        tools: [],
        soft: [],
      },
      languages: [],
      certificates: [],
      source: {
        cvFile: sourceFile,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  buildCandidateBrief(structuredCv = null) {
    if (!structuredCv || typeof structuredCv !== "object") return null;

    const candidate = structuredCv?.candidate || {};
    const education = Array.isArray(structuredCv?.education) ? structuredCv.education : [];
    const experienceItems = [
      ...(Array.isArray(structuredCv?.experience?.professional) ? structuredCv.experience.professional : []),
      ...(Array.isArray(structuredCv?.experience?.intern) ? structuredCv.experience.intern : []),
    ];
    const professionalExperienceItems = Array.isArray(structuredCv?.experience?.professional)
      ? structuredCv.experience.professional
      : [];
    const internExperienceItems = Array.isArray(structuredCv?.experience?.intern)
      ? structuredCv.experience.intern
      : [];
    const projects = Array.isArray(structuredCv?.projects) ? structuredCv.projects : [];
    const activities = Array.isArray(structuredCv?.activities) ? structuredCv.activities : [];
    const skills = structuredCv?.skills || {};
    const technicalSkills = Array.isArray(skills?.technical) ? skills.technical : [];
    const toolSkills = Array.isArray(skills?.tools) ? skills.tools : [];
    const softSkills = Array.isArray(skills?.soft) ? skills.soft : [];

    const uniqueStrings = (items = [], limit = 8) =>
      [...new Set(
        (Array.isArray(items) ? items : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )].slice(0, limit);

    const compactSentence = (text = "", maxLength = 220) => {
      const clean = String(text || "").replace(/\s+/g, " ").trim();
      if (!clean) return "";
      if (clean.length <= maxLength) return clean;

      const sliced = clean.slice(0, maxLength);
      const lastBreak = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf("; "), sliced.lastIndexOf(", "));
      if (lastBreak >= 60) return `${sliced.slice(0, lastBreak).trim()}.`;
      return `${sliced.trim()}...`;
    };

    const joinListNatural = (items = [], maxItems = 3) => {
      const picked = uniqueStrings(items, maxItems);
      if (picked.length === 0) return "";
      if (picked.length === 1) return picked[0];
      if (picked.length === 2) return `${picked[0]} ve ${picked[1]}`;
      return `${picked.slice(0, -1).join(", ")} ve ${picked[picked.length - 1]}`;
    };

    const educationHighlights = education
      .map((item) => {
        const program = [item?.department || "", item?.degree || ""].filter(Boolean).join(" ");
        return [program, item?.school || ""].filter(Boolean).join(" - ");
      })
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 3);

    const experienceHighlights = experienceItems
      .map((item) => {
        const lead = [item?.position || "", item?.company || ""].filter(Boolean).join(" @ ");
        const firstResponsibility = Array.isArray(item?.responsibilities) ? item.responsibilities[0] : "";
        return [lead, firstResponsibility].filter(Boolean).join(": ");
      })
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 4);

    const projectHighlights = projects
      .map((item) => {
        const lead = String(item?.name || "").trim();
        const detail = String(item?.description || (Array.isArray(item?.highlights) ? item.highlights[0] : "") || "").trim();
        return [lead, detail].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .slice(0, 3);

    const skillHighlights = [
      ...technicalSkills,
      ...toolSkills,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 10);

    const toExperienceHeading = (item) => {
      const position = String(item?.position || "").trim();
      const company = String(item?.company || "").trim();
      return [position, company].filter(Boolean).join(" @ ");
    };

    const hrExperienceHighlights = uniqueStrings([
      ...professionalExperienceItems.map(toExperienceHeading),
      ...internExperienceItems.map(toExperienceHeading),
    ], 4);

    const fallbackHrExperienceHighlights = uniqueStrings([
      ...hrExperienceHighlights,
      ...activities.map((item) => String(item?.title || "").trim()),
    ], 4);

    const inferredFocusAreas = [
      ...softSkills,
      ...activities.flatMap((item) => [item?.title, ...(Array.isArray(item?.details) ? item.details : [])]),
      ...experienceItems.flatMap((item) => Array.isArray(item?.responsibilities) ? item.responsibilities.slice(0, 2) : []),
    ].flatMap((text) => {
      const clean = String(text || "").trim();
      if (!clean) return [];
      const focusMatches = [];
      if (/analitik|analysis|problem|optimiz/i.test(clean)) focusMatches.push("Analitik dusunme ve problem cozme");
      if (/takim|ekip|collaboration|team/i.test(clean)) focusMatches.push("Takim calismasi ve is birligi");
      if (/lider|yonet|koordin|organize|baskan|başkan/i.test(clean)) focusMatches.push("Liderlik ve koordinasyon");
      if (/iletisim|sunum|anlat|rapor|konusma|konuşma/i.test(clean)) focusMatches.push("Iletisim ve kendini ifade etme");
      if (/sorumluluk|ownership|inisiyatif|initiative/i.test(clean)) focusMatches.push("Sorumluluk alma ve inisiyatif");
      if (/ogren|arastir|gelistir|adapt/i.test(clean)) focusMatches.push("Ogrenme istegi ve gelisime aciklik");
      return focusMatches;
    });

    const hrFocusHighlights = uniqueStrings(inferredFocusAreas, 5);

    const summary = String(candidate?.summary || "").replace(/\s+/g, " ").trim();
    const latestTechnicalRole = experienceItems[0]?.position ? String(experienceItems[0].position).trim() : "";
    const technicalSummary = compactSentence(summary || [
      latestTechnicalRole ? `${latestTechnicalRole} deneyimi bulunan` : "",
      technicalSkills.length > 0 ? `${joinListNatural(technicalSkills, 4)} alanlarina odaklanan` : "",
      projectHighlights[0] ? "proje gelistirme ve teknik problem cozme deneyimi olan" : "",
      "bir aday profili"
    ].filter(Boolean).join(" "));

    const hrSummary = [
      summary,
      fallbackHrExperienceHighlights.length > 0 ? `Deneyim gecmisinde ${joinListNatural(fallbackHrExperienceHighlights, 3)} bulunuyor.` : "",
      hrFocusHighlights.length > 0 ? `HR acisindan one cikan yonleri ${joinListNatural(hrFocusHighlights, 3)}.` : "",
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    const candidateBrief = {
      headline: String(candidate?.title || candidate?.fullName || "").trim(),
      summary: technicalSummary,
      technicalSummary,
      hrSummary,
      educationHighlights: uniqueStrings(educationHighlights, 3),
      experienceHighlights: uniqueStrings(experienceHighlights, 4),
      projectHighlights: uniqueStrings(projectHighlights, 3),
      skillHighlights: uniqueStrings(skillHighlights, 10),
      hrExperienceHighlights: hrExperienceHighlights.length > 0 ? hrExperienceHighlights : fallbackHrExperienceHighlights,
      hrFocusHighlights,
    };

    const hasContent =
      candidateBrief.headline
      || candidateBrief.summary
      || candidateBrief.technicalSummary
      || candidateBrief.hrSummary
      || candidateBrief.educationHighlights.length > 0
      || candidateBrief.experienceHighlights.length > 0
      || candidateBrief.projectHighlights.length > 0
      || candidateBrief.skillHighlights.length > 0
      || candidateBrief.hrExperienceHighlights.length > 0
      || candidateBrief.hrFocusHighlights.length > 0;

    return hasContent ? candidateBrief : null;
  }

  normalizeCvJsonArray(items = []) {
    return Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : [];
  }

  normalizeCvJsonStringArray(items = []) {
    return (Array.isArray(items) ? items : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  cleanupCvLines(text = "") {
    return String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => {
        if (!line) return false;
        if (/^--\s*\d+\s*(?:of|\/)\s*\d+\s*--$/i.test(line)) return false;
        return true;
      });
  }

  normalizeHeadingText(text = "") {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}0-9\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizeHeadingCompact(text = "") {
    return this.normalizeHeadingText(text).replace(/\s+/g, "");
  }

  normalizeLooseHeadingCompact(text = "") {
    return this.normalizeHeadingCompact(text)
      .replace(/[^a-z0-9]/g, "")
      .replace(/(^|[a-z])i(?=[a-z])/g, "$1i");
  }

  isLikelyHeading(line = "") {
    const clean = String(line || "").trim();
    if (!clean) return false;
    const normalized = this.normalizeHeadingText(clean);
    const compact = this.normalizeHeadingCompact(clean);
    const loose = this.normalizeLooseHeadingCompact(clean);

    const headings = [
      "iletisim",
      "hakkimizda",
      "deneyimler",
      "not ortalamasi",
      "profil",
      "ozet",
      "özet",
      "hakkimda",
      "hakkımda",
      "egitim",
      "eğitim",
      "education",
      "deneyim",
      "tecrube",
      "tecrübe",
      "experience",
      "is deneyimi",
      "iş deneyimi",
      "projeler",
      "projects",
      "beceriler",
      "yetkinlikler",
      "skills",
      "teknik beceriler",
      "diller",
      "languages",
      "sertifikalar",
      "certificates",
      "objective",
      "amac",
      "extra curricular activities",
      "ekstra kurumsal faaliyetler",
      "yetenekler",
      "sosyal aktiviteler",
    ];

    const compactHeadings = headings.map((item) => this.normalizeHeadingCompact(item));
    const looseHeadings = headings.map((item) => this.normalizeLooseHeadingCompact(item));

    if (headings.includes(normalized) || compactHeadings.includes(compact) || looseHeadings.includes(loose)) {
      return true;
    }

    if (clean.length > 40) return false;

    return (
      loose.includes("amac")
      || loose.includes("ozet")
      || loose.includes("profil")
      || loose.includes("egitim")
      || loose.includes("education")
      || loose.includes("deneyim")
      || loose.includes("experience")
      || loose.includes("proj")
      || loose.includes("yetenek")
      || loose.includes("beceri")
      || loose.includes("skills")
      || loose.includes("sosyalaktiv")
    );
  }

  sectionKeyFromHeading(line = "") {
    const clean = String(line || "").trim();
    const normalized = this.normalizeHeadingText(line);
    const compact = this.normalizeHeadingCompact(line);
    const loose = this.normalizeLooseHeadingCompact(line);

    if (clean.length > 40) {
      if (
        ["profil", "ozet", "özet", "hakkimda", "hakkımda", "objective", "amac", "egitim", "eğitim", "education", "deneyim", "tecrube", "tecrübe", "experience", "is deneyimi", "iş deneyimi", "projeler", "projects", "beceriler", "yetenekler", "yetkinlikler", "skills", "teknik beceriler", "diller", "languages", "sertifikalar", "certificates", "extra curricular activities", "ekstra kurumsal faaliyetler", "sosyal aktiviteler"].includes(normalized)
      ) {
        // allow exact long headings only
      } else {
        return null;
      }
    }

    if (
      ["profil", "ozet", "özet", "hakkimda", "hakkımda", "objective", "amac"].includes(normalized)
      || ["profil", "ozet", "hakkimda", "objective", "amac"].includes(compact)
      || loose.includes("amac")
      || loose.includes("ozet")
      || loose.includes("profil")
    ) return "summary";
    if (
      ["egitim", "eğitim", "education"].includes(normalized)
      || ["egitim", "education"].includes(compact)
      || loose.includes("egitim")
      || loose.includes("education")
    ) return "education";
    if (
      ["deneyim", "tecrube", "tecrübe", "experience", "is deneyimi", "iş deneyimi"].includes(normalized)
      || ["deneyim", "tecrube", "experience", "isdeneyimi"].includes(compact)
      || loose.includes("deneyim")
      || loose.includes("experience")
    ) return "experience";
    if (
      ["projeler", "projects"].includes(normalized)
      || ["projeler", "projects"].includes(compact)
      || loose.includes("proje")
      || loose.includes("project")
    ) return "projects";
    if (
      ["beceriler", "yetenekler", "yetkinlikler", "skills", "teknik beceriler"].includes(normalized)
      || ["beceriler", "yetenekler", "yetkinlikler", "skills", "teknikbeceriler"].includes(compact)
      || loose.includes("beceri")
      || loose.includes("yetenek")
      || loose.includes("skill")
    ) return "skills";
    if (
      ["diller", "languages"].includes(normalized)
      || ["diller", "languages"].includes(compact)
    ) return "languages";
    if (
      ["sertifikalar", "certificates"].includes(normalized)
      || ["sertifikalar", "certificates"].includes(compact)
    ) return "certificates";
    if (
      ["extra curricular activities", "ekstra kurumsal faaliyetler", "sosyal aktiviteler"].includes(normalized)
      || ["extracurricularactivities", "ekstrakurumsalfaaliyetler", "sosyalaktiviteler"].includes(compact)
      || loose.includes("sosyalaktiv")
      || loose.includes("extracurricular")
    ) return "activities";
    return null;
  }

  splitCvSections(text = "") {
    const lines = this.cleanupCvLines(text);
    const sections = { header: [] };
    let current = "header";

    for (const line of lines) {
      const key = this.sectionKeyFromHeading(line);
      if (key) {
        current = key;
        if (!sections[current]) sections[current] = [];
        continue;
      }
      if (!sections[current]) sections[current] = [];
      sections[current].push(line);
    }

    return sections;
  }

  inferFullName(lines = [], sourceFile = "cv.txt") {
    const first = (Array.isArray(lines) ? lines : []).find((line) => line && !this.isLikelyHeading(line)) || "";
    if (first && first.length <= 80) return first;

    return String(sourceFile || "candidate")
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\bcv\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  isLikelyContactLine(line = "") {
    const text = String(line || "").toLowerCase();
    return (
      /@/.test(text)
      || /https?:\/\//.test(text)
      || /www\./.test(text)
      || /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{2,4}\b/.test(text)
      || /\+\d{1,3}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{2,4}/.test(text)
    );
  }

  isLikelyNameLine(line = "") {
    const clean = String(line || "").trim();
    if (!clean || this.isLikelyHeading(clean) || this.isLikelyContactLine(clean)) return false;
    if (clean.length > 40 || /\d/.test(clean)) return false;

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return false;
    if (words.some((word) => word.length < 2 || word.length > 20)) return false;
    return words.every((word) => /^[\p{L}'’.-]+$/u.test(word));
  }

  extractLikelyFullName(lines = [], sourceFile = "cv.txt") {
    const candidates = [];
    for (const rawLine of Array.isArray(lines) ? lines : []) {
      const line = String(rawLine || "").trim();
      if (!this.isLikelyNameLine(line)) continue;
      const words = line.split(/\s+/).filter(Boolean);
      const score = [
        words.length >= 2 && words.length <= 3 ? 3 : 0,
        /[A-ZÇĞİÖŞÜ]/u.test(line) ? 2 : 0,
        !/[0-9@/\\]|https?:/i.test(line) ? 2 : 0,
      ].reduce((sum, item) => sum + item, 0);
      candidates.push({ line, score });
    }

    candidates.sort((a, b) => b.score - a.score || a.line.length - b.line.length);
    const picked = candidates[0]?.line || "";
    if (picked) return picked;

    return String(sourceFile || "candidate")
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\bcv\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  extractProfileSummary(lines = []) {
    const candidates = [];
    for (const rawLine of Array.isArray(lines) ? lines : []) {
      const line = String(rawLine || "").trim();
      if (!line) continue;
      if (this.isLikelyHeading(line) || this.isLikelyContactLine(line)) continue;
      if (line.length < 80) continue;

      const lowered = line.toLowerCase();
      const summaryMarkers = [
        "ogrencisiyim",
        "öğrencisiyim",
        "odaklaniyorum",
        "odaklanıyorum",
        "hedefliyorum",
        "gelistirmeye",
        "geliştirmeye",
        "ilgi duyuyorum",
        "kendimi gelistirmeye",
        "kendimi geliştirmeye",
        "amacliyorum",
        "amaçlıyorum",
        "kariyerime",
        "pekistirerek",
        "pekiştirerek",
      ];
      const markerScore = summaryMarkers.reduce((score, marker) => score + (lowered.includes(marker) ? 2 : 0), 0);
      const sentenceScore = (line.match(/[.!?]/g) || []).length;
      candidates.push({ line, score: markerScore * 10 + line.length + sentenceScore });
    }

    candidates.sort((a, b) => b.score - a.score || b.line.length - a.line.length);
    return candidates[0]?.line || "";
  }

  buildSummaryFromSection(lines = []) {
    const summaryLines = [];

    for (const rawLine of Array.isArray(lines) ? lines : []) {
      const line = String(rawLine || "").trim();
      if (!line) continue;
      if (/^[-•]/.test(line)) break;
      if (this.parseDateRangeAtEnd(line)) break;
      if (summaryLines.length > 0 && this.isLikelyExperienceRoleLine(line)) break;
      summaryLines.push(line);
    }

    return summaryLines
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  extractHeadlineCandidate(lines = [], fallback = "") {
    const candidates = [];
    for (const rawLine of Array.isArray(lines) ? lines : []) {
      const line = String(rawLine || "").trim();
      if (!line) continue;
      if (this.isLikelyHeading(line) || this.isLikelyContactLine(line)) continue;
      if (line.length < 4 || line.length > 60) continue;
      if (/[\d@]/.test(line)) continue;
      if (/[.!?]/.test(line)) continue;
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length > 5) continue;

      const score = [
        words.length >= 2 && words.length <= 4 ? 2 : 0,
        /[A-ZÇĞİÖŞÜ]/u.test(line) ? 2 : 0,
        line === line.toUpperCase() ? 1 : 0,
      ].reduce((sum, item) => sum + item, 0);
      candidates.push({ line, score });
    }

    candidates.sort((a, b) => b.score - a.score || a.line.length - b.line.length);
    return candidates[0]?.line || fallback || "";
  }

  splitBlocks(lines = []) {
    const blocks = [];
    let current = [];

    for (const line of Array.isArray(lines) ? lines : []) {
      const looksLikeNewItem =
        current.length > 0 &&
        !line.startsWith("-") &&
        !line.startsWith("•") &&
        /(\d{4}|halen|devam|present|current)/i.test(line) &&
        current.length >= 4;

      if (looksLikeNewItem) {
        blocks.push(current);
        current = [line];
      } else {
        current.push(line);
      }
    }

    if (current.length > 0) blocks.push(current);
    return blocks;
  }

  parseDateRange(line = "") {
    const match = String(line || "").match(/((?:19|20)\d{2}(?:[./-]\d{1,2})?|halen|devam ediyor|devam|present|current)\s*[-–]\s*((?:19|20)\d{2}(?:[./-]\d{1,2})?|halen|devam ediyor|devam|present|current)/i);
    if (!match) return { startDate: "", endDate: "" };
    return {
      startDate: String(match[1] || "").trim(),
      endDate: String(match[2] || "").trim(),
    };
  }

  parseDateRangeAtEnd(line = "") {
    const match = String(line || "").match(
      /^(.*?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Oca|Şub|Sub|Mar|Nis|May|Haz|Tem|Ağu|Agu|Eyl|Eki|Kas|Ara)\s+\d{4}|(?:19|20)\d{2})\s*[–-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Oca|Şub|Sub|Mar|Nis|May|Haz|Tem|Ağu|Agu|Eyl|Eki|Kas|Ara)\s+\d{4}|(?:19|20)\d{2}|PRESENT|CURRENT|GÜNÜMÜZ|DEVAM(?:\s+EDIYOR|\s+EDİYOR)?)$/i
    );
    if (!match) return null;
    return {
      prefix: String(match[1] || "").trim().replace(/[,\-–]+$/, "").trim(),
      startDate: String(match[2] || "").trim(),
      endDate: String(match[3] || "").trim(),
    };
  }

  parseEducation(lines = []) {
    const entries = [];
    const degreePattern = /(Bachelor[’'`s]* Degree|Master[’'`s]* Degree|Lisans Derecesi|Yuksek Lisans|Yüksek Lisans|On Lisans|Ön Lisans|Double Major|Cift Anadal|Çift Anadal|Doktora|PhD|Lisans)/i;
    let i = 0;
    while (i < lines.length) {
      const current = String(lines[i] || "").trim();
      const inline = this.parseDateRangeAtEnd(current);
      if (inline) {
        const parts = inline.prefix.split(",").map((part) => part.trim()).filter(Boolean);
        const firstPart = parts[0] || "";
        const otherParts = parts.slice(1);
        const leadingDegreeMatch = firstPart.match(new RegExp(`^${degreePattern.source}\\s+(?:in|of)?\\s*(.*)$`, "i"));
        const trailingDegreeMatch = firstPart.match(new RegExp(`^(.*?)\\s+${degreePattern.source}$`, "i"));
        const degree = leadingDegreeMatch
          ? String(leadingDegreeMatch[1] || "").trim()
          : trailingDegreeMatch
            ? String(trailingDegreeMatch[2] || "").trim()
            : "";
        const department = leadingDegreeMatch
          ? String(leadingDegreeMatch[2] || "").trim()
          : trailingDegreeMatch
            ? String(trailingDegreeMatch[1] || "").trim()
            : firstPart;
        const school = otherParts[0] || "";
        const details = [];
        let j = i + 1;
        while (j < lines.length && !this.parseDateRangeAtEnd(lines[j]) && !this.isLikelyHeading(lines[j])) {
          details.push(lines[j]);
          j += 1;
        }
        entries.push({
          school,
          department,
          degree,
          startDate: inline.startDate,
          endDate: inline.endDate,
          details,
        });
        i = j;
        continue;
      }

      i += 1;
    }

    return entries.filter((item) => item.school || item.department || item.degree);
  }

  classifyExperienceType(position = "", company = "") {
    const text = `${String(position || "")} ${String(company || "")}`.toLowerCase();
    const internMarkers = [
      "intern",
      "internship",
      "stajyer",
      "staj",
      "trainee",
      "apprentice",
    ];

    return internMarkers.some((marker) => text.includes(marker)) ? "intern" : "professional";
  }

  buildExperienceSummary(experience = []) {
    const items = Array.isArray(experience) ? experience : [];
    const internCount = items.filter((item) => item?.experienceType === "intern").length;
    const professionalCount = items.filter((item) => item?.experienceType === "professional").length;

    return {
      totalCount: items.length,
      internCount,
      professionalCount,
    };
  }

  isLikelyEducationEntry(line = "", nextLine = "") {
    const combined = `${String(line || "")} ${String(nextLine || "")}`.toLowerCase();
    return (
      /universite|üniversite|faculty|fakulte|fakülte|gpa|derecesi|lisans|yuksek lisans|yüksek lisans|phd|double major|cift anadal|çift anadal/i.test(combined)
    );
  }

  isLikelyExperienceRoleLine(line = "") {
    const clean = String(line || "").trim();
    if (!clean) return false;
    if (this.isLikelyHeading(clean)) return false;
    if (/^[-•]/.test(clean)) return false;
    if (this.parseDateRangeAtEnd(clean)) return false;
    return (
      /stajyer|intern|muhendis|mühendis|developer|gelistirici|geliştirici|specialist|uzmani|uzmanı|analyst|analist|assistant|asistan|engineer|coordinator|koordinator|koordinatör|manager|yonetici|yönetici/i.test(clean)
    );
  }

  dedupeExperienceEntries(items = []) {
    const mergedByKey = new Map();

    const scoreEntry = (item = {}) => {
      const responsibilities = Array.isArray(item?.responsibilities) ? item.responsibilities.length : 0;
      const technologies = Array.isArray(item?.technologies) ? item.technologies.length : 0;
      return (
        (String(item?.company || "").trim() ? 2 : 0)
        + (String(item?.position || "").trim() ? 2 : 0)
        + responsibilities * 3
        + technologies
      );
    };

    const mergeEntries = (base = {}, incoming = {}) => {
      const baseResponsibilities = Array.isArray(base?.responsibilities) ? base.responsibilities : [];
      const incomingResponsibilities = Array.isArray(incoming?.responsibilities) ? incoming.responsibilities : [];
      const baseTechnologies = Array.isArray(base?.technologies) ? base.technologies : [];
      const incomingTechnologies = Array.isArray(incoming?.technologies) ? incoming.technologies : [];

      const preferred = scoreEntry(incoming) > scoreEntry(base) ? incoming : base;
      const secondary = preferred === incoming ? base : incoming;

      return {
        company: String(preferred?.company || secondary?.company || "").trim(),
        position: String(preferred?.position || secondary?.position || "").trim(),
        experienceType: String(preferred?.experienceType || secondary?.experienceType || "professional").trim() || "professional",
        startDate: String(preferred?.startDate || secondary?.startDate || "").trim(),
        endDate: String(preferred?.endDate || secondary?.endDate || "").trim(),
        location: String(preferred?.location || secondary?.location || "").trim(),
        responsibilities: [...new Set([...baseResponsibilities, ...incomingResponsibilities].map((item) => String(item || "").trim()).filter(Boolean))],
        technologies: [...new Set([...baseTechnologies, ...incomingTechnologies].map((item) => String(item || "").trim()).filter(Boolean))],
      };
    };

    for (const item of Array.isArray(items) ? items : []) {
      const key = [
        String(item?.company || "").trim().toLowerCase(),
        String(item?.position || "").trim().toLowerCase(),
        String(item?.startDate || "").trim().toLowerCase(),
        String(item?.endDate || "").trim().toLowerCase(),
      ].join("|");
      if (!key.replace(/\|/g, "")) continue;
      if (!mergedByKey.has(key)) {
        mergedByKey.set(key, item);
        continue;
      }
      mergedByKey.set(key, mergeEntries(mergedByKey.get(key), item));
    }
    return Array.from(mergedByKey.values());
  }

  parseExperienceFromAllLines(lines = []) {
    const entries = [];
    const allLines = Array.isArray(lines) ? lines : [];

    for (let i = 0; i < allLines.length; i += 1) {
      const current = String(allLines[i] || "").trim();
      const next = String(allLines[i + 1] || "").trim();
      const header = this.parseDateRangeAtEnd(current);
      if (!header) continue;
      if (this.isLikelyEducationEntry(current, next)) continue;
      if (!this.isLikelyExperienceRoleLine(next)) continue;

      const responsibilities = [];
      let j = i + 2;
      while (j < allLines.length) {
        const line = String(allLines[j] || "").trim();
        if (!line) {
          j += 1;
          continue;
        }
        if (this.parseDateRangeAtEnd(line) || this.isLikelyHeading(line)) break;
        if (this.isLikelyExperienceRoleLine(line) && responsibilities.length > 0) break;
        responsibilities.push(line.replace(/^[-•]\s*/, "").trim());
        j += 1;
      }

      const joined = [header.prefix, next, ...responsibilities].join(" | ");
      entries.push({
        company: header.prefix,
        position: next,
        experienceType: this.classifyExperienceType(next, header.prefix),
        startDate: header.startDate,
        endDate: header.endDate,
        location: "",
        responsibilities: responsibilities.filter(Boolean),
        technologies: this.extractTechnologies(joined),
      });
    }

    return this.dedupeExperienceEntries(entries);
  }

  parseExperience(lines = []) {
    const entries = [];
    let i = 0;
    while (i < lines.length) {
      const header = this.parseDateRangeAtEnd(lines[i]);
      if (!header) {
        i += 1;
        continue;
      }

      const company = header.prefix;
      const position = String(lines[i + 1] || "").trim();
      if (this.isLikelyEducationEntry(lines[i], position) || !this.isLikelyExperienceRoleLine(position)) {
        i += 1;
        continue;
      }
      const responsibilities = [];
      let j = i + 2;
      while (j < lines.length && !this.parseDateRangeAtEnd(lines[j]) && !this.isLikelyHeading(lines[j])) {
        responsibilities.push(String(lines[j] || "").replace(/^[-•]\s*/, "").trim());
        j += 1;
      }

      const joined = [company, position, ...responsibilities].join(" | ");
      entries.push({
        company,
        position,
        experienceType: this.classifyExperienceType(position, company),
        startDate: header.startDate,
        endDate: header.endDate,
        location: "",
        responsibilities: responsibilities.filter(Boolean),
        technologies: this.extractTechnologies(joined),
      });
      i = j;
    }

    return this.dedupeExperienceEntries(entries.filter((item) => item.company || item.position));
  }

  parseProjects(lines = []) {
    const entries = [];
    let i = 0;
    while (i < lines.length) {
      const name = String(lines[i] || "").trim();
      if (!name) {
        i += 1;
        continue;
      }
      if (/^[-•]/.test(name)) {
        i += 1;
        continue;
      }
      if (this.parseDateRangeAtEnd(name)) {
        i += 1;
        continue;
      }

      const nextLine = String(lines[i + 1] || "").trim();
      if (this.parseDateRangeAtEnd(nextLine)) {
        i += 1;
        continue;
      }
      if (this.isLikelyExperienceRoleLine(name)) {
        i += 1;
        continue;
      }
      const role = /^[-•]/.test(nextLine) ? "" : nextLine;
      const highlights = [];
      let description = "";
      let j = role ? i + 2 : i + 1;
      while (j < lines.length && !this.isLikelyHeading(lines[j])) {
        const line = String(lines[j] || "").trim();
        if (this.parseDateRangeAtEnd(line)) break;
        if (/^[-•]/.test(line)) highlights.push(line.replace(/^[-•]\s*/, ""));
        else if (!description) description = line;
        else break;
        j += 1;
      }

      const text = [name, role, description, ...highlights].join(" | ");
      entries.push({
        name,
        role,
        description,
        technologies: this.extractTechnologies(text),
        highlights,
      });
      i = j;
    }

    return entries.filter((item) => item.name || item.description);
  }

  extractTechnologies(text = "") {
    const known = [
      "Python", "Java", "JavaScript", "TypeScript", "React", "Node.js", "Express", "FastAPI",
      "SQL", "PostgreSQL", "MySQL", "MongoDB", "Docker", "Git", "C", "C++", "C#", "HTML", "CSS",
      "Tailwind", "TensorFlow", "PyTorch", "Pandas", "NumPy", "OpenCV", "Mediapipe", "Linux",
    ];
    const clean = String(text || "");
    return known.filter((item) => {
      const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/#/g, "#");
      const regex = new RegExp(`(^|[^A-Za-z0-9+.#])${escaped}([^A-Za-z0-9+.#]|$)`, "i");
      return regex.test(clean);
    });
  }

  parseSkills(lines = []) {
    const groups = { technical: [], tools: [], soft: [] };
    for (const line of lines) {
      const normalized = this.normalizeHeadingText(line);
      const cleaned = line.replace(/^[-•]\s*/, "").trim();
      if (/^(technical skills|teknik beceriler)/i.test(cleaned)) {
        groups.technical.push(cleaned.replace(/^(technical skills|teknik beceriler)\s*/i, "").trim());
        continue;
      }
      if (/^(programming languages|programlama dilleri)/i.test(cleaned)) {
        groups.technical.push(cleaned.replace(/^(programming languages|programlama dilleri)\s*/i, "").trim());
        continue;
      }
      if (/^(soft skills|yumusak beceriler|yumuşak beceriler|kisisel yetenekler|kişisel yetenekler)/i.test(cleaned)) {
        groups.soft.push(cleaned.replace(/^(soft skills|yumusak beceriler|yumuşak beceriler|kisisel yetenekler|kişisel yetenekler)\s*/i, "").trim());
        continue;
      }
      if (/^(teknik yetenekler)/i.test(cleaned)) {
        groups.technical.push(cleaned.replace(/^(teknik yetenekler)\s*/i, "").trim());
        continue;
      }
      if (normalized) groups.technical.push(cleaned);
    }

    const tokenize = (items) => items
      .flatMap((line) => line.split(/[,|/]/g))
      .map((part) => part.trim())
      .filter(Boolean);

    const allTechnical = tokenize(groups.technical);
    const tools = allTechnical.filter((item) => /git|docker|jira|figma|linux|postman|github|power bi|oracle|mysql|cplex|autocad|arena|matlab|ms office|excel|word|powerpoint|access/i.test(item));
    const soft = tokenize(groups.soft).concat(
      allTechnical.filter((item) => /iletisim|iletişim|takim|takım|liderlik|problem|analitik|zaman|communication|leadership|teamwork|openness|learning/i.test(item))
    );
    const technical = allTechnical.filter((item) => !tools.includes(item) && !soft.includes(item));

    return {
      technical: [...new Set(technical)],
      tools: [...new Set(tools)],
      soft: [...new Set(soft)],
    };
  }

  parseLanguages(lines = []) {
    return lines.map((line) => {
      const cleaned = line.replace(/^[-•]\s*/, "");
      const parts = cleaned.split(/[:\-|]/).map((part) => part.trim()).filter(Boolean);
      return {
        name: parts[0] || cleaned,
        level: parts[1] || "",
      };
    }).filter((item) => item.name);
  }

  parseCertificates(lines = []) {
    return lines.map((line) => {
      const cleaned = line.replace(/^[-•]\s*/, "").trim();
      const parts = cleaned.split(/[-|]/).map((part) => part.trim()).filter(Boolean);
      return {
        name: parts[0] || "",
        issuer: parts[1] || "",
        date: parts[2] || "",
      };
    }).filter((item) => item.name);
  }

  parseActivities(lines = []) {
    const entries = [];
    let current = null;

    for (const rawLine of Array.isArray(lines) ? lines : []) {
      const line = String(rawLine || "").trim();
      if (!line) continue;

      if (/^[-•]/.test(line)) {
        if (current) entries.push(current);
        current = {
          title: line.replace(/^[-•]\s*/, "").trim(),
          details: [],
        };
        continue;
      }

      if (!current) {
        current = {
          title: line,
          details: [],
        };
        continue;
      }

      current.details.push(line);
    }

    if (current) entries.push(current);

    return entries
      .map((item) => ({
        title: String(item.title || "").trim(),
        details: this.normalizeCvJsonStringArray(item.details),
      }))
      .filter((item) => item.title);
  }

  normalizeStructuredCvJson(payload, { sourceFile = "cv.txt" } = {}) {
    const base = this.createEmptyCvJson({ sourceFile });
    if (!payload || typeof payload !== "object") return base;

    const rawExperienceItems = this.normalizeCvJsonArray(
      payload?.experience?.items
      || [
        ...this.normalizeCvJsonArray(payload?.experience?.professional),
        ...this.normalizeCvJsonArray(payload?.experience?.intern),
      ]
      || payload?.experience
    );

    const experienceItems = rawExperienceItems.map((item) => ({
      company: String(item.company || "").trim(),
      position: String(item.position || "").trim(),
      experienceType: String(item.experienceType || "professional").trim() || "professional",
      startDate: String(item.startDate || "").trim(),
      endDate: String(item.endDate || "").trim(),
      location: String(item.location || "").trim(),
      responsibilities: this.normalizeCvJsonStringArray(item.responsibilities),
      technologies: this.normalizeCvJsonStringArray(item.technologies),
    }));
    const computedExperienceSummary = this.buildExperienceSummary(experienceItems);
    const professionalItems = experienceItems.filter((item) => item.experienceType === "professional");
    const internItems = experienceItems.filter((item) => item.experienceType === "intern");

    return {
      candidate: {
        fullName: String(payload?.candidate?.fullName || "").trim(),
        title: String(payload?.candidate?.title || "").trim(),
        summary: String(payload?.candidate?.summary || "").trim(),
      },
      education: this.normalizeCvJsonArray(payload.education).map((item) => ({
        school: String(item.school || "").trim(),
        department: String(item.department || "").trim(),
        degree: String(item.degree || "").trim(),
        startDate: String(item.startDate || "").trim(),
        endDate: String(item.endDate || "").trim(),
        details: this.normalizeCvJsonStringArray(item.details),
      })),
      experience: {
        totalCount: Number(payload?.experience?.totalCount ?? computedExperienceSummary.totalCount),
        internCount: Number(payload?.experience?.internCount ?? computedExperienceSummary.internCount),
        professionalCount: Number(payload?.experience?.professionalCount ?? computedExperienceSummary.professionalCount),
        professional: professionalItems,
        intern: internItems,
      },
      projects: this.normalizeCvJsonArray(payload.projects).map((item) => ({
        name: String(item.name || "").trim(),
        role: String(item.role || "").trim(),
        description: String(item.description || "").trim(),
        technologies: this.normalizeCvJsonStringArray(item.technologies),
        highlights: this.normalizeCvJsonStringArray(item.highlights),
      })),
      activities: this.normalizeCvJsonArray(payload.activities).map((item) => ({
        title: String(item.title || "").trim(),
        details: this.normalizeCvJsonStringArray(item.details),
      })),
      skills: {
        technical: this.normalizeCvJsonStringArray(payload?.skills?.technical),
        tools: this.normalizeCvJsonStringArray(payload?.skills?.tools),
        soft: this.normalizeCvJsonStringArray(payload?.skills?.soft),
      },
      languages: this.normalizeCvJsonArray(payload.languages).map((item) => ({
        name: String(item.name || "").trim(),
        level: String(item.level || "").trim(),
      })),
      certificates: this.normalizeCvJsonArray(payload.certificates).map((item) => ({
        name: String(item.name || "").trim(),
        issuer: String(item.issuer || "").trim(),
        date: String(item.date || "").trim(),
      })),
      source: {
        cvFile: String(payload?.source?.cvFile || sourceFile).trim() || sourceFile,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async buildStructuredCvJson(text = "", { sourceFile = "cv.txt" } = {}) {
    const clean = this.normalizeExtractedPdfText(text);
    if (!clean) return this.createEmptyCvJson({ sourceFile });
    const sections = this.splitCvSections(clean);
    const allLines = this.cleanupCvLines(clean);
    const headerLines = sections.header || [];
    const summaryLines = sections.summary || [];
    const sectionExperience = this.parseExperience(sections.experience || []);
    const globalExperience = this.parseExperienceFromAllLines(allLines);
    const parsedExperience = this.dedupeExperienceEntries([
      ...sectionExperience,
      ...globalExperience,
    ]);
    const summaryFromSection = this.buildSummaryFromSection(summaryLines);
    const summaryFromText = this.extractProfileSummary(allLines);
    const fullName = this.extractLikelyFullName(allLines, sourceFile);
    const titleCandidate = this.extractHeadlineCandidate(headerLines, "");

    return this.normalizeStructuredCvJson({
      candidate: {
        fullName,
        title: titleCandidate && !this.isLikelyHeading(titleCandidate) ? titleCandidate : "",
        summary: summaryFromSection || summaryFromText || headerLines.slice(2, 5).join(" "),
      },
      education: this.parseEducation(sections.education || []),
      experience: {
        ...this.buildExperienceSummary(parsedExperience),
        professional: parsedExperience.filter((item) => item.experienceType === "professional"),
        intern: parsedExperience.filter((item) => item.experienceType === "intern"),
      },
      projects: this.parseProjects(sections.projects || []),
      activities: this.parseActivities(sections.activities || []),
      skills: this.parseSkills(sections.skills || []),
      languages: this.parseLanguages(sections.languages || []),
      certificates: this.parseCertificates(sections.certificates || []),
      source: {
        cvFile: sourceFile,
      },
    }, { sourceFile });
  }

  normalizeCvFile(cvFile = null) {
    if (!cvFile || typeof cvFile !== "object") return null;

    const mimeType = String(cvFile.mimeType || "");
    const dataBase64 = String(cvFile.dataBase64 || "");
    if (mimeType !== "application/pdf" || !dataBase64) return null;

    return {
      name: this.sanitizeFileName(cvFile.name || "cv.pdf"),
      mimeType,
      dataBase64,
    };
  }

  async saveCvFile({ sessionId, cvFile }) {
    const result = await this.analyzeCvFile({ sessionId, cvFile });
    if (!result) return { sessionDir: await this.ensureSessionDir(sessionId), savedCv: null };

    const { sessionDir, normalized, pdfBuffer, cvText, translatedCvText, structuredCvJson, sourceFile } = result;
    const candidateBrief = this.buildCandidateBrief(structuredCvJson);

    const cvDir = path.join(sessionDir, "cv");
    await mkdir(cvDir, { recursive: true });

    const fullPath = path.join(cvDir, normalized.name);
    await writeFile(fullPath, pdfBuffer);

    const textFileName = "cv.txt";
    const textFullPath = path.join(cvDir, textFileName);
    await writeFile(textFullPath, cvText, "utf8");

    let trTextFullPath = null;
    let trTextRelativePath = null;
    if (translatedCvText) {
      const trTextFileName = "cv_tr.txt";
      trTextFullPath = path.join(cvDir, trTextFileName);
      trTextRelativePath = path.join("cv", trTextFileName);
      await writeFile(trTextFullPath, translatedCvText, "utf8");
    }

    const cvJsonFileName = "cv.json";
    const cvJsonFullPath = path.join(cvDir, cvJsonFileName);
    await writeFile(cvJsonFullPath, `${JSON.stringify(structuredCvJson, null, 2)}
`, "utf8");

    const candidateBriefFileName = "candidate_brief.json";
    const candidateBriefFullPath = path.join(cvDir, candidateBriefFileName);
    await writeFile(candidateBriefFullPath, `${JSON.stringify(candidateBrief, null, 2)}
`, "utf8");

    return {
      sessionDir,
      savedCv: {
        fileName: normalized.name,
        relativePath: path.join("cv", normalized.name),
        fullPath,
        textRelativePath: path.join("cv", textFileName),
        textFullPath,
        trTextRelativePath,
        trTextFullPath,
        jsonRelativePath: path.join("cv", cvJsonFileName),
        jsonFullPath: cvJsonFullPath,
        candidateBriefRelativePath: path.join("cv", candidateBriefFileName),
        candidateBriefFullPath,
        candidateBrief,
      },
    };
  }

  async analyzeCvFile({ sessionId, cvFile }) {
    const normalized = this.normalizeCvFile(cvFile);
    const sessionDir = await this.ensureSessionDir(sessionId);
    if (!normalized) return null;

    const pdfBuffer = Buffer.from(normalized.dataBase64, "base64");
    if (pdfBuffer.length === 0) return null;

    const cvText = await this.extractTextFromPdfBuffer(pdfBuffer);
    const translatedCvText = await this.translateCvTextToTurkish(cvText);
    const structuredCvSourceFile = "cv.txt";
    const structuredCvText = cvText;
    const structuredCvJson = await this.buildStructuredCvJson(structuredCvText, {
      sourceFile: structuredCvSourceFile,
    });
    return {
      sessionDir,
      normalized,
      pdfBuffer,
      cvText,
      translatedCvText,
      structuredCvJson,
      sourceFile: structuredCvSourceFile,
    };
  }

  async saveIncrementalCandidateAnswerAudio({ sessionId, candidateAnswerAudio }) {
    const normalized = this.normalizeCandidateAnswerAudios([candidateAnswerAudio]);
    const answer = normalized[0] || null;
    if (!answer) return null;

    const sessionDir = await this.ensureSessionDir(sessionId);
    const answersDir = path.join(sessionDir, "audio");
    await mkdir(answersDir, { recursive: true });

    const nextSequence = await this.getNextAnswerSequence(answersDir);
    const fileName = this.buildAnswerFileName(answer, nextSequence);
    const fullPath = path.join(answersDir, fileName);
    const audioBuffer = Buffer.from(answer.audioBase64, "base64");
    if (audioBuffer.length === 0) return null;

    await writeFile(fullPath, audioBuffer);
    return {
      questionIndex: answer.questionIndex,
      mimeType: answer.mimeType,
      startedAt: answer.startedAt,
      endedAt: answer.endedAt,
      fileName,
      relativePath: path.join("audio", fileName),
      fullPath,
    };
  }

  async getNextAnswerSequence(answersDir) {
    const files = await readdir(answersDir, { withFileTypes: true }).catch(() => []);
    let maxSequence = 0;

    for (const file of files) {
      if (!file?.isFile?.()) continue;
      const match = /^answer_(\d+)\./i.exec(file.name);
      if (!match) continue;
      maxSequence = Math.max(maxSequence, Number(match[1] || 0));
    }

    return maxSequence + 1;
  }

  buildSavedAudioKey(item = {}) {
    return [item?.questionIndex, item?.startedAt, item?.endedAt].join(":");
  }

  async saveCandidateAnswerAudioFiles({ sessionDir, candidateAnswerAudios, startSequence = 1 }) {
    const normalized = this.normalizeCandidateAnswerAudios(candidateAnswerAudios);
    if (normalized.length === 0) return [];

    const answersDir = path.join(sessionDir, "audio");
    await mkdir(answersDir, { recursive: true });

    const sorted = [...normalized].sort((a, b) => a.startedAt - b.startedAt);
    const saved = [];
    let seq = startSequence;

    for (const answer of sorted) {
      const fileName = this.buildAnswerFileName(answer, seq);
      const fullPath = path.join(answersDir, fileName);

      const audioBuffer = Buffer.from(answer.audioBase64, "base64");
      if (audioBuffer.length === 0) continue;
      await writeFile(fullPath, audioBuffer);
      saved.push({
        questionIndex: answer.questionIndex,
        mimeType: answer.mimeType,
        startedAt: answer.startedAt,
        endedAt: answer.endedAt,
        fileName,
        relativePath: path.join("audio", fileName),
      });
      seq++;
    }

    return saved;
  }

  buildTranscriptEntries({ transcript, report }) {
    const direct = Array.isArray(transcript) ? transcript : [];
    const cleanedDirect = direct
      .map((item) => ({
        role: item?.role === "interviewer" ? "interviewer" : "candidate",
        text: String(item?.text || "").trim(),
        ts: Number(item?.ts || Date.now()),
        source: String(item?.source || "").trim(),
        model: String(item?.model || "").trim(),
      }))
      .filter((item) => item.text.length > 0);

    if (cleanedDirect.length > 0) return cleanedDirect;

    const qa = Array.isArray(report?.qaEvaluations) ? report.qaEvaluations : [];
    const fromQa = [];
    for (const row of qa) {
      const question = String(row?.question || "").trim();
      const answer = String(row?.answer || "").trim();
      if (question) fromQa.push({ role: "interviewer", text: question, ts: Date.now() });
      if (answer) fromQa.push({ role: "candidate", text: answer, ts: Date.now() });
    }

    return fromQa;
  }

  mergeSavedAudioFiles(existingFiles = [], newFiles = []) {
    const out = [];
    const seen = new Set();

    for (const file of [...existingFiles, ...newFiles]) {
      const key = [file?.questionIndex, file?.startedAt, file?.endedAt, file?.relativePath].join(":");
      if (!file?.relativePath || seen.has(key)) continue;
      seen.add(key);
      out.push(file);
    }

    return out.sort((a, b) => Number(a?.startedAt || 0) - Number(b?.startedAt || 0));
  }

  async saveVisionAnalysisArtifacts({ sessionDir, visionAnalysis = null }) {
    const normalized = this.normalizeVisionAnalysis(visionAnalysis);
    if (!normalized) return null;

    const visionDir = path.join(sessionDir, "vision");
    if (this.persistVisionJpegs) {
      await mkdir(visionDir, { recursive: true });
    }

    const savedSamples = [];
    for (const sample of normalized.samples) {
      let relativeImagePath = null;
      if (this.persistVisionJpegs && sample.imageBase64) {
        const fileName = `frame_${String(sample.index).padStart(2, "0")}.jpg`;
        const fullPath = path.join(visionDir, fileName);
        const imageBuffer = Buffer.from(sample.imageBase64, "base64");
        if (imageBuffer.length > 0) {
          await writeFile(fullPath, imageBuffer);
          relativeImagePath = path.join("vision", fileName);
        }
      }

      savedSamples.push({
        ...sample,
        imageBase64: undefined,
        imagePath: relativeImagePath,
      });
    }

    const payload = {
      ...normalized,
      samples: savedSamples,
    };

    const relativePath = "vision_frames.json";
    await writeFile(path.join(sessionDir, relativePath), `${JSON.stringify(payload, null, 2)}
`, "utf8");
    return {
      ...payload,
      relativePath,
    };
  }

  async readJsonIfExists(filePath) {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async readTextIfExists(filePath) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      return "";
    }
  }

  buildScoreMeta() {
    return {
      overall: { label: "Genel Skor", min: 0, max: 100 },
      audio: {
        label: "Ses Skorları",
        items: {
          overallClarity: { label: "Ses Netliği", min: 0, max: 100 },
        },
      },
      vision: {
        label: "Görüntü Skorları",
        items: {
          facePresenceScore: { label: "Yüz Görünürlüğü", min: 0, max: 100 },
          focusScore: { label: "Odak", min: 0, max: 100 },
          centeringScore: { label: "Kadraj", min: 0, max: 100 },
          steadinessScore: { label: "Stabilite", min: 0, max: 100 },
          visualTensionScore: { label: "Görsel Gerginlik", min: 0, max: 100, inverted: true },
          attentionRiskScore: { label: "Dikkat Riski", min: 0, max: 100, inverted: true },
          movementRiskScore: { label: "Hareket Riski", min: 0, max: 100, inverted: true },
          eyeTensionScore: { label: "Göz Teması Riski", min: 0, max: 100, inverted: true },
        },
      },
    };
  }

  async loadFeedbackArtifacts(sessionId) {
    const sessionDir = await this.ensureSessionDir(sessionId);
    const [audioModel, transcriptAnalysis, visionAnalysis, visionLlmAnalysis, audioLlmReport, transcriptText, sessionConfig] = await Promise.all([
      this.readJsonIfExists(path.join(sessionDir, "audio_segments.json")),
      this.readJsonIfExists(path.join(sessionDir, "transcript_report.json")),
      this.readJsonIfExists(path.join(sessionDir, "vision_frames.json")),
      this.readJsonIfExists(path.join(sessionDir, "vision_report.json")),
      this.readJsonIfExists(path.join(sessionDir, "audio_report.json")),
      this.readTextIfExists(path.join(sessionDir, "transcript.txt")),
      this.readJsonIfExists(path.join(sessionDir, "session_config.json")),
    ]);

    return {
      transcriptText: String(transcriptText || "").trim(),
      audioModel,
      audioLlmReport: audioLlmReport || null,
      transcriptAnalysis,
      visionAnalysis,
      visionLlmAnalysis,
      sessionConfig: sessionConfig || null,
      scoreMeta: this.buildScoreMeta(),
    };
  }

  async listSessionSummaries({ limit = 50 } = {}) {
    const baseDir = this.baseDir;
    await mkdir(baseDir, { recursive: true });
    const entries = await readdir(baseDir, { withFileTypes: true });
    const sessions = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("S-")) continue;

      const sessionId = entry.name;
      const sessionDir = path.join(baseDir, sessionId);
      const stats = await stat(sessionDir);
      const [transcriptAnalysis, audioReport, visionReport, transcriptText, sessionConfig] = await Promise.all([
        this.readJsonIfExists(path.join(sessionDir, "transcript_report.json")),
        this.readJsonIfExists(path.join(sessionDir, "audio_report.json")),
        this.readJsonIfExists(path.join(sessionDir, "vision_report.json")),
        this.readTextIfExists(path.join(sessionDir, "transcript.txt")),
        this.readJsonIfExists(path.join(sessionDir, "session_config.json")),
      ]);

      const overallScore =
        transcriptAnalysis?.overallScore
        ?? transcriptAnalysis?.overall?.overallScore
        ?? null;

      if (!transcriptAnalysis) continue;

      const preview = String(transcriptText || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)[0] || "";

      sessions.push({
        sessionId,
        createdAt: stats.mtime.toISOString(),
        overallScore,
        hasTranscript: Boolean(transcriptAnalysis),
        hasAudio: Boolean(audioReport),
        hasVision: Boolean(visionReport),
        transcriptPreview: preview.slice(0, 160),
        sessionConfig: sessionConfig || transcriptAnalysis?.sessionConfig || null,
      });
    }

    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sessions.slice(0, Math.max(1, Number(limit) || 50));
  }

  async save({ sessionId, transcript, report, candidateAnswerAudios = [], existingCandidateAnswerAudioFiles = [], visionAnalysis = null }) {
    const sessionDir = await this.ensureSessionDir(sessionId);
    const transcriptEntries = this.buildTranscriptEntries({ transcript, report });
    const transcriptTextPath = path.join(sessionDir, `transcript.txt`);

    const transcriptText = transcriptEntries
      .map((item) => {
        const role = item?.role === "interviewer" ? "Interviewer" : "Candidate";
        return `[${role}] ${String(item?.text || "").trim()}`;
      })
      .filter(Boolean)
      .join("\n");

    const existingKeys = new Set(existingCandidateAnswerAudioFiles.map((item) => this.buildSavedAudioKey(item)));
    const unsavedCandidateAnswerAudios = this.normalizeCandidateAnswerAudios(candidateAnswerAudios).filter(
      (item) => !existingKeys.has(this.buildSavedAudioKey(item))
    );

    const newlySavedCandidateAnswerAudioFiles = await this.saveCandidateAnswerAudioFiles({
      sessionDir,
      candidateAnswerAudios: unsavedCandidateAnswerAudios,
      startSequence: existingCandidateAnswerAudioFiles.length + 1,
    });
    const savedCandidateAnswerAudioFiles = this.mergeSavedAudioFiles(
      existingCandidateAnswerAudioFiles,
      newlySavedCandidateAnswerAudioFiles
    );

    const visionArtifacts = await this.saveVisionAnalysisArtifacts({ sessionDir, visionAnalysis });

    const safeTranscriptText = transcriptText || "[Interviewer] (metin kaydı alınamadı)";
    await writeFile(transcriptTextPath, `${safeTranscriptText}
`, "utf8");
    return {
      savedCandidateAnswerAudioFiles,
      sessionDir,
      transcriptText,
      visionArtifacts,
    };
  }
}
