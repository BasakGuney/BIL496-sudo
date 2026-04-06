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

  sanitizeFileName(fileName = "cv.pdf") {
    const cleaned = String(fileName || "cv.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
  }

  normalizeExtractedPdfText(text = "") {
    return String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
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

  isLikelyHeading(line = "") {
    const clean = String(line || "").trim();
    if (!clean) return false;
    const normalized = this.normalizeHeadingText(clean);

    const headings = [
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
    ];

    return headings.includes(normalized);
  }

  sectionKeyFromHeading(line = "") {
    const normalized = this.normalizeHeadingText(line);

    if (["profil", "ozet", "hakkimda", "objective", "amac"].includes(normalized)) return "summary";
    if (["egitim", "eğitim", "education"].includes(normalized)) return "education";
    if (["deneyim", "tecrube", "experience", "is deneyimi"].includes(normalized)) return "experience";
    if (["projeler", "projects"].includes(normalized)) return "projects";
    if (["beceriler", "yetkinlikler", "skills", "teknik beceriler"].includes(normalized)) return "skills";
    if (["diller", "languages"].includes(normalized)) return "languages";
    if (["sertifikalar", "certificates"].includes(normalized)) return "certificates";
    if (["extra curricular activities", "ekstra kurumsal faaliyetler"].includes(normalized)) return "activities";
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
      /^(.*?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Oca|Şub|Sub|Mar|Nis|May|Haz|Tem|Ağu|Agu|Eyl|Eki|Kas|Ara)\s+\d{4}|(?:19|20)\d{2})\s*[–-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Oca|Şub|Sub|Mar|Nis|May|Haz|Tem|Ağu|Agu|Eyl|Eki|Kas|Ara)\s+\d{4}|(?:19|20)\d{2}|PRESENT|CURRENT|GÜNÜMÜZ|DEVAM)$/i
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
    let i = 0;
    while (i < lines.length) {
      const current = String(lines[i] || "").trim();
      const inline = this.parseDateRangeAtEnd(current);
      if (inline) {
        const parts = inline.prefix.split(",").map((part) => part.trim()).filter(Boolean);
        const firstPart = parts[0] || "";
        const otherParts = parts.slice(1);
        const degreeMatch = firstPart.match(/(Bachelor[’'`s]* Degree|Master[’'`s]* Degree|Lisans Derecesi|Yuksek Lisans|Yüksek Lisans|Lisans|On Lisans|Ön Lisans|Doktora|PhD|Double Major|Cift Anadal|Çift Anadal)\s+(?:in|of)?\s*(.*)$/i);
        const degree = degreeMatch ? String(degreeMatch[1] || "").trim() : "";
        const department = degreeMatch ? String(degreeMatch[2] || "").trim() : firstPart;
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

    return entries.filter((item) => item.company || item.position);
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

      const role = String(lines[i + 1] || "").trim();
      const highlights = [];
      let description = "";
      let j = i + 2;
      while (j < lines.length && !this.isLikelyHeading(lines[j])) {
        const line = String(lines[j] || "").trim();
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
      if (/^(soft skills|yumusak beceriler|yumuşak beceriler)/i.test(cleaned)) {
        groups.soft.push(cleaned.replace(/^(soft skills|yumusak beceriler|yumuşak beceriler)\s*/i, "").trim());
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
    const clean = String(text || "").trim();
    if (!clean) return this.createEmptyCvJson({ sourceFile });
    const sections = this.splitCvSections(clean);
    const headerLines = sections.header || [];
    const summaryLines = sections.summary || [];
    const parsedExperience = this.parseExperience(sections.experience || []);

    return this.normalizeStructuredCvJson({
      candidate: {
        fullName: this.inferFullName(headerLines, sourceFile),
        title: headerLines[1] || "",
        summary: summaryLines.join(" ") || headerLines.slice(2, 5).join(" "),
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
    const normalized = this.normalizeCvFile(cvFile);
    const sessionDir = await this.ensureSessionDir(sessionId);
    if (!normalized) return { sessionDir, savedCv: null };

    const cvDir = path.join(sessionDir, "cv");
    await mkdir(cvDir, { recursive: true });

    const pdfBuffer = Buffer.from(normalized.dataBase64, "base64");
    if (pdfBuffer.length === 0) return { sessionDir, savedCv: null };

    const fullPath = path.join(cvDir, normalized.name);
    await writeFile(fullPath, pdfBuffer);
    const cvText = await this.extractTextFromPdfBuffer(pdfBuffer);
    const textFileName = "cv.txt";
    const textFullPath = path.join(cvDir, textFileName);
    await writeFile(textFullPath, cvText, "utf8");
    const translatedCvText = await this.translateCvTextToTurkish(cvText);

    let trTextFullPath = null;
    let trTextRelativePath = null;
    if (translatedCvText) {
      const trTextFileName = "cv_tr.txt";
      trTextFullPath = path.join(cvDir, trTextFileName);
      trTextRelativePath = path.join("cv", trTextFileName);
      await writeFile(trTextFullPath, translatedCvText, "utf8");
    }

    const structuredCvSourceFile = "cv.txt";
    const structuredCvText = cvText;
    const structuredCvJson = await this.buildStructuredCvJson(structuredCvText, {
      sourceFile: structuredCvSourceFile,
    });
    const cvJsonFileName = "cv.json";
    const cvJsonFullPath = path.join(cvDir, cvJsonFileName);
    await writeFile(cvJsonFullPath, `${JSON.stringify(structuredCvJson, null, 2)}
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
      },
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
    const [audioModel, transcriptAnalysis, visionAnalysis, visionLlmAnalysis, audioLlmReport, transcriptText] = await Promise.all([
      this.readJsonIfExists(path.join(sessionDir, "audio_segments.json")),
      this.readJsonIfExists(path.join(sessionDir, "transcript_report.json")),
      this.readJsonIfExists(path.join(sessionDir, "vision_frames.json")),
      this.readJsonIfExists(path.join(sessionDir, "vision_report.json")),
      this.readJsonIfExists(path.join(sessionDir, "audio_report.json")),
      this.readTextIfExists(path.join(sessionDir, "transcript.txt")),
    ]);

    return {
      transcriptText: String(transcriptText || "").trim(),
      audioModel,
      audioLlmReport: audioLlmReport || null,
      transcriptAnalysis,
      visionAnalysis,
      visionLlmAnalysis,
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
      const [transcriptAnalysis, audioReport, visionReport, transcriptText] = await Promise.all([
        this.readJsonIfExists(path.join(sessionDir, "transcript_report.json")),
        this.readJsonIfExists(path.join(sessionDir, "audio_report.json")),
        this.readJsonIfExists(path.join(sessionDir, "vision_report.json")),
        this.readTextIfExists(path.join(sessionDir, "transcript.txt")),
      ]);

      const overallScore =
        transcriptAnalysis?.overallScore
        ?? transcriptAnalysis?.overall?.overallScore
        ?? null;

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
