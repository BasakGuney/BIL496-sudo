import { InterviewSession } from "../domain/entities/InterviewSession.js";
import { SessionState } from "../domain/enums/SessionState.js";
import { SessionConfig } from "../domain/value-objects/SessionConfig.js";
import { Consent } from "../domain/value-objects/Consent.js";
import { AppError } from "../domain/errors/AppError.js";

export class BackendOrchestrator {
  constructor({ sessions, reports, ai, analyzer, guardrails, realtimeManager, idGenerator, reportArchive, candidateAudioTranscriber = null, pythonAnalysisClient = null, visionFrameAnalyzer = null, costEstimator = null }) {
    this.sessions = sessions;
    this.reports = reports;
    this.ai = ai;
    this.analyzer = analyzer;
    this.guardrails = guardrails;
    this.realtimeManager = realtimeManager;
    this.idGenerator = idGenerator;
    this.reportArchive = reportArchive;
    this.candidateAudioTranscriber = candidateAudioTranscriber;
    this.pythonAnalysisClient = pythonAnalysisClient;
    this.visionFrameAnalyzer = visionFrameAnalyzer;
    this.costEstimator = costEstimator;
  }

  createDefaultVisionRuntimeState() {
    return {
      sampledFrames: 0,
      faceDetectedFrames: 0,
      totalFaceAreaRatio: 0,
      totalCenterOffset: 0,
      movementAccumulator: 0,
      lastCenter: null,
      samples: [],
      lastResult: null,
      lastSavedAttentionLevel: null,
      lastSavedSampleMeta: null,
      warnFrames: 0,
      dangerFrames: 0,
      lowEyeFrames: 0,
      supportiveOverlayUsed: false,
      source: this.visionFrameAnalyzer ? "server-python-mediapipe" : "unavailable",
      status: this.visionFrameAnalyzer ? "ready" : "unavailable",
      lastAttentionLevel: "ok",
      notes: [],
    };
  }

  createDefaultRuntimeState() {
    return {
      incrementalCandidateAnswerAudios: [],
      incrementalSavedAudioFiles: [],
      analyzedAudioRelativePaths: [],
      vision: this.createDefaultVisionRuntimeState(),
    };
  }

  async createSession(cfgInput, offerSdp = "", sessionId = null) {
    const id = sessionId || this.idGenerator.newId();
    const existingSession = await this.sessions.findById(id);
    const cfgSource = cfgInput instanceof SessionConfig ? { ...cfgInput } : (cfgInput || {});
    const cfg = new SessionConfig({
      ...(existingSession?.config || {}),
      ...cfgSource,
      cvFile: cfgSource?.cvFile || existingSession?.config?.cvFile || null,
      candidateBrief: cfgSource?.candidateBrief ?? existingSession?.config?.candidateBrief ?? null,
    });
    const answerSdp = offerSdp ? await this.realtimeManager.createOfferAnswer(id, offerSdp, cfg) : "";

    const session = existingSession || new InterviewSession({
      id,
      state: SessionState.CONFIGURED,
      config: cfg,
      offerSdp,
      answerSdp,
    });

    session.config = cfg;
    session.offerSdp = offerSdp;
    session.answerSdp = answerSdp;

    await this.sessions.create(session);
    if (this.reportArchive?.ensureSessionDir) {
      await this.reportArchive.ensureSessionDir(id);
    }
    if (this.reportArchive?.saveSessionConfig) {
      await this.reportArchive.saveSessionConfig({ sessionId: id, sessionConfig: session.config });
    }
    if (this.reportArchive?.saveCvFile && (!existingSession || cfgSource?.cvFile) && cfg.cvFile) {
      const cvResult = await this.reportArchive.saveCvFile({ sessionId: id, cvFile: cfg.cvFile });
      const candidateBrief = cvResult?.savedCv?.candidateBrief || null;
      if (candidateBrief) {
        session.config = new SessionConfig({
          ...session.config,
          candidateBrief,
        });
      }
      session.runtimeState = session.runtimeState || {};
      session.runtimeState.cvPersisted = Boolean(cvResult?.savedCv);
      await this.sessions.update(session);
      if (this.reportArchive?.saveSessionConfig) {
        await this.reportArchive.saveSessionConfig({ sessionId: id, sessionConfig: session.config });
      }
    }
    return session;
  }

  async updateSessionConfig(sessionId, cfgInput = {}) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });

    const nextConfig = cfgInput instanceof SessionConfig
      ? cfgInput
      : new SessionConfig({
          ...(session.config || {}),
          ...(cfgInput || {}),
          cvFile: cfgInput?.cvFile || session.config?.cvFile || null,
          candidateBrief: cfgInput?.candidateBrief ?? session.config?.candidateBrief ?? null,
        });

    session.config = new SessionConfig({
      ...(session.config || {}),
      ...nextConfig,
      cvFile: nextConfig.cvFile || session.config?.cvFile || null,
      candidateBrief: nextConfig.candidateBrief ?? session.config?.candidateBrief ?? null,
    });

    await this.sessions.update(session);
    if (cfgInput?.cvFile && this.reportArchive?.saveCvFile) {
      const cvResult = await this.reportArchive.saveCvFile({ sessionId, cvFile: session.config.cvFile });
      const candidateBrief = cvResult?.savedCv?.candidateBrief || null;
      if (candidateBrief) {
        session.config = new SessionConfig({
          ...session.config,
          candidateBrief,
        });
      }
      session.runtimeState = session.runtimeState || {};
      session.runtimeState.cvPersisted = Boolean(cvResult?.savedCv);
      await this.sessions.update(session);
    }
    if (this.reportArchive?.saveSessionConfig) {
      await this.reportArchive.saveSessionConfig({ sessionId: sessionId, sessionConfig: session.config });
    }
    return session;
  }

  async updateConsent(sessionId, consentInput) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });

    const consent = consentInput instanceof Consent ? consentInput : new Consent(consentInput);
    this.guardrails.enforceRequiredConsent(consent);

    session.consent = consent;
    session.state = SessionState.CONSENT_GRANTED;
    await this.sessions.update(session);
    return session;
  }

  async startSession(sessionId) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });

    this.guardrails.enforceStateForStart(session);

    if (this.reportArchive?.saveCvFile && session.config?.cvFile && !session.runtimeState?.cvPersisted) {
      const cvResult = await this.reportArchive.saveCvFile({ sessionId, cvFile: session.config.cvFile });
      const candidateBrief = cvResult?.savedCv?.candidateBrief;
      if (candidateBrief) {
        session.config = new SessionConfig({
          ...session.config,
          candidateBrief,
        });
      }
      session.runtimeState = session.runtimeState || {};
      session.runtimeState.cvPersisted = true;
      await this.sessions.update(session);
    }

    if (this.reportArchive?.saveSessionConfig) {
      await this.reportArchive.saveSessionConfig({ sessionId, sessionConfig: session.config });
    }

    session.start();
    await this.sessions.update(session);

    const firstQuestion = await this.ai.generateFirstQuestion(session.config);
    return { turnIndex: 1, questionText: firstQuestion, sessionId };
  }

  async generatePreviewQuestions(cfgInput) {
    const cfg = cfgInput instanceof SessionConfig ? cfgInput : new SessionConfig(cfgInput);
    return await this.ai.generatePreviewQuestions(cfg);
  }

  async generateLiveHints(sessionId, question) {
    const session = await this.sessions.findById(sessionId);
    return await this.ai.generateLiveHints(question, {
      onUsage: (usage) => {
        if (session?.addTokenUsage) {
          session.addTokenUsage("liveHints", usage);
          this.sessions.update(session);
        }
      },
    });
  }

  async generateLiveFeedback(sessionId, question, answer) {
    const session = await this.sessions.findById(sessionId);
    return await this.ai.generateLiveFeedback(question, answer, {
      onUsage: (usage) => {
        if (session?.addTokenUsage) {
          session.addTokenUsage("liveFeedback", usage);
          this.sessions.update(session);
        }
      },
    });
  }

  async recordUsage(sessionId, kind, usage) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });
    if (session?.addTokenUsage) {
      session.addTokenUsage(kind, usage);
      await this.sessions.update(session);
    }
    return session?.tokenUsage || null;
  }

  buildAnswerKey(answer = {}) {
    return [
      Number(answer?.questionIndex || 0),
      Number(answer?.startedAt || 0),
      Number(answer?.endedAt || 0),
    ].join(":");
  }

  getRuntimeState(session) {
    const defaults = this.createDefaultRuntimeState();
    const current = session.runtimeState && typeof session.runtimeState === "object"
      ? session.runtimeState
      : {};
    const currentVision = current.vision && typeof current.vision === "object"
      ? current.vision
      : {};

    session.runtimeState = {
      ...defaults,
      ...current,
      incrementalCandidateAnswerAudios: Array.isArray(current.incrementalCandidateAnswerAudios)
        ? current.incrementalCandidateAnswerAudios
        : [],
      incrementalSavedAudioFiles: Array.isArray(current.incrementalSavedAudioFiles)
        ? current.incrementalSavedAudioFiles
        : [],
      analyzedAudioRelativePaths: Array.isArray(current.analyzedAudioRelativePaths)
        ? current.analyzedAudioRelativePaths
        : [],
      vision: {
        ...defaults.vision,
        ...currentVision,
        samples: Array.isArray(currentVision.samples) ? currentVision.samples : [],
        notes: Array.isArray(currentVision.notes) ? currentVision.notes : [],
      },
    };

    return session.runtimeState;
  }

  mergeUniqueAnswers(...groups) {
    const out = [];
    const seen = new Set();

    for (const group of groups) {
      for (const item of Array.isArray(group) ? group : []) {
        const key = this.buildAnswerKey(item);
        if (key === "0:0:0" || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }

    return out.sort((a, b) => Number(a?.startedAt || 0) - Number(b?.startedAt || 0));
  }

  mergeUniqueTranscriptEntries(...groups) {
    const out = [];
    const seen = new Set();

    for (const group of groups) {
      for (const item of Array.isArray(group) ? group : []) {
        const key = [
          item?.role === "interviewer" ? "interviewer" : "candidate",
          Number(item?.ts || 0),
          String(item?.text || "").trim(),
        ].join(":");
        if (!String(item?.text || "").trim() || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }

    return out.sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
  }

  async buildFallbackTranscriptEntries(candidateAnswerAudios = []) {
    if (!this.candidateAudioTranscriber) return [];

    try {
      return await this.candidateAudioTranscriber.transcribeCandidateAnswerAudios(candidateAnswerAudios);
    } catch (error) {
      this.logger?.warn?.("Candidate audio transcription fallback failed", error);
      return [];
    }
  }

  mergeUniqueSavedAudioFiles(...groups) {
    const out = [];
    const seen = new Set();

    for (const group of groups) {
      for (const item of Array.isArray(group) ? group : []) {
        const key = [item?.relativePath, item?.questionIndex, item?.startedAt, item?.endedAt].join(":");
        if (!item?.relativePath || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }

    return out.sort((a, b) => Number(a?.startedAt || 0) - Number(b?.startedAt || 0));
  }

  filterTranscriptByRole(transcript = [], role = "candidate") {
    return (Array.isArray(transcript) ? transcript : []).filter((item) => item?.role === role);
  }


  computeAttentionLevel({ bbox, imageWidth, imageHeight, faceCount }) {
    if (!bbox || !imageWidth || !imageHeight) return "danger";
    if (Number(faceCount || 0) > 1) return "warn";

    const centerX = Number(bbox.x || 0) + Number(bbox.width || 0) / 2;
    const centerY = Number(bbox.y || 0) + Number(bbox.height || 0) / 2;
    const offset = Math.sqrt(
      Math.pow((centerX / Math.max(1, Number(imageWidth))) - 0.5, 2)
      + Math.pow((centerY / Math.max(1, Number(imageHeight))) - 0.5, 2)
    );
    const faceAreaRatio = (Number(bbox.width || 0) * Number(bbox.height || 0))
      / Math.max(1, Number(imageWidth) * Number(imageHeight));

    if (offset >= 0.24 || faceAreaRatio < 0.035) return "danger";
    if (offset >= 0.14 || faceAreaRatio < 0.055) return "warn";
    return "ok";
  }

  shouldPersistVisionSample({ vision, bbox, attentionLevel, imageWidth, imageHeight, faceCount, frameIndex, eyeCount = 0 }) {
    if (!bbox || !imageWidth || !imageHeight) return false;

    const centerX = Number(bbox.x || 0) + Number(bbox.width || 0) / 2;
    const centerY = Number(bbox.y || 0) + Number(bbox.height || 0) / 2;
    const normalizedCenterX = centerX / Math.max(1, Number(imageWidth));
    const normalizedCenterY = centerY / Math.max(1, Number(imageHeight));
    const areaRatio = (Number(bbox.width || 0) * Number(bbox.height || 0))
      / Math.max(1, Number(imageWidth) * Number(imageHeight));

    const current = {
      frameIndex: Number(frameIndex || 0),
      attentionLevel: String(attentionLevel || "ok"),
      faceCount: Number(faceCount || 0),
      centerX: Number(normalizedCenterX.toFixed(4)),
      centerY: Number(normalizedCenterY.toFixed(4)),
      areaRatio: Number(areaRatio.toFixed(4)),
    };

    const last = vision.lastSavedSampleMeta;
    if (!last) {
      vision.lastSavedSampleMeta = current;
      return true;
    }

    const attentionChanged = current.attentionLevel !== last.attentionLevel;
    const faceCountChanged = current.faceCount !== last.faceCount;
    const centerShift = Math.sqrt(
      Math.pow(current.centerX - Number(last.centerX || 0), 2)
      + Math.pow(current.centerY - Number(last.centerY || 0), 2)
    );
    const sizeShift = Math.abs(current.areaRatio - Number(last.areaRatio || 0));
    const frameGap = Math.max(0, current.frameIndex - Number(last.frameIndex || 0));

    const isImportantMoment = current.attentionLevel !== "ok" || Number(eyeCount || 0) < 2;
    const changedEnough = isImportantMoment
      || attentionChanged
      || faceCountChanged
      || centerShift >= 0.03
      || sizeShift >= 0.02
      || frameGap >= 8;

    if (changedEnough) {
      vision.lastSavedSampleMeta = current;
      return true;
    }

    return false;
  }



  async ingestVisionFrame(sessionId, payload = {}) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });

    const runtime = this.getRuntimeState(session);
    const vision = runtime.vision;
    const imageBase64 = String(payload?.imageBase64 || "");
    const frameIndex = Number(payload?.frameIndex || vision.sampledFrames + 1);
    const supportiveMode = Boolean(payload?.supportiveMode);

    if (!imageBase64) {
      throw new AppError("Vision frame payload is invalid", { code: "INVALID_VISION_FRAME", statusCode: 400 });
    }

    vision.sampledFrames += 1;
    vision.supportiveOverlayUsed = vision.supportiveOverlayUsed || supportiveMode;

    const result = this.visionFrameAnalyzer
      ? await this.visionFrameAnalyzer.analyzeFrame({ imageBase64 })
      : { status: "unavailable", message: "Vision analyzer unavailable.", faceCount: 0, bbox: null, faceCropBase64: "" };

    vision.status = result?.status === "invalid" ? "limited" : (result?.status || vision.status || "unavailable");
    vision.source = String(result?.source || vision.source || "");
    vision.lastResult = {
      status: result?.status || "unavailable",
      message: result?.message || "Görüntü analizi hazır değil.",
      faceCount: Number(result?.faceCount || 0),
      eyeCount: Number(result?.eyeCount || 0),
      bbox: result?.bbox || null,
      imageWidth: Number(result?.imageWidth || 0),
      imageHeight: Number(result?.imageHeight || 0),
      source: String(result?.source || ""),
      detector: result?.detector || null,
    };

    const attentionLevel = this.computeAttentionLevel({
      bbox: result?.bbox,
      imageWidth: Number(result?.imageWidth || 0),
      imageHeight: Number(result?.imageHeight || 0),
      faceCount: Number(result?.faceCount || 0),
    });
    vision.lastAttentionLevel = attentionLevel;
    if (attentionLevel === "warn") vision.warnFrames += 1;
    if (attentionLevel === "danger") vision.dangerFrames += 1;

    if (result?.bbox) {
      const bbox = result.bbox;
      const faceAreaRatio = (Number(bbox.width || 0) * Number(bbox.height || 0))
        / Math.max(1, Number(result?.imageWidth || 1) * Number(result?.imageHeight || 1));
      const centerX = Number(bbox.x || 0) + Number(bbox.width || 0) / 2;
      const centerY = Number(bbox.y || 0) + Number(bbox.height || 0) / 2;
      const centerOffset = Math.sqrt(
        Math.pow((centerX / Math.max(1, Number(result?.imageWidth || 1))) - 0.5, 2)
        + Math.pow((centerY / Math.max(1, Number(result?.imageHeight || 1))) - 0.5, 2)
      );

      vision.faceDetectedFrames += 1;
      vision.totalFaceAreaRatio += faceAreaRatio;
      vision.totalCenterOffset += centerOffset;
      if (vision.lastCenter) {
        vision.movementAccumulator += Math.sqrt(
          Math.pow((centerX - vision.lastCenter.x) / Math.max(1, Number(result?.imageWidth || 1)), 2)
          + Math.pow((centerY - vision.lastCenter.y) / Math.max(1, Number(result?.imageHeight || 1)), 2)
        );
      }
      vision.lastCenter = { x: centerX, y: centerY };

      if (Number(result?.eyeCount || 0) < 2) {
        vision.lowEyeFrames += 1;
      }

      const shouldSaveSample = result?.faceCropBase64 && this.shouldPersistVisionSample({
        vision,
        bbox,
        attentionLevel,
        imageWidth: Number(result?.imageWidth || 0),
        imageHeight: Number(result?.imageHeight || 0),
        faceCount: Number(result?.faceCount || 0),
        frameIndex,
        eyeCount: Number(result?.eyeCount || 0),
      });
      if (shouldSaveSample) {
        vision.samples.push({
          ts: Number(payload?.ts || Date.now()),
          frameIndex,
          hasFace: true,
          bbox,
          imageBase64: result.faceCropBase64,
          attentionLevel,
        });
        vision.lastSavedAttentionLevel = attentionLevel;
        if (vision.samples.length > 60) {
          const importantSamples = vision.samples.filter((sample) => sample?.attentionLevel && sample.attentionLevel !== "ok");
          const regularSamples = vision.samples.filter((sample) => !sample?.attentionLevel || sample.attentionLevel === "ok");
          const keptRegular = regularSamples.slice(-36);
          const keptImportant = importantSamples.slice(-24);
          vision.samples = [...keptRegular, ...keptImportant].sort((a, b) => Number(a?.frameIndex || 0) - Number(b?.frameIndex || 0));
        }
      }
    }

    const note = String(result?.message || "").trim();
    if (note && !vision.notes.includes(note) && vision.notes.length < 6) {
      vision.notes.push(note);
    }

    await this.sessions.update(session);
    return {
      supported: Boolean(this.visionFrameAnalyzer),
      detecting: result?.status !== "unavailable",
      hasFace: Boolean(result?.bbox),
      faceCount: Number(result?.faceCount || 0),
      box: result?.bbox || null,
      message: result?.message || "Görüntü analizi hazır değil.",
      source: vision.source,
      status: vision.status,
      attentionLevel,
      imageWidth: Number(result?.imageWidth || 0),
      imageHeight: Number(result?.imageHeight || 0),
      eyeCount: Number(result?.eyeCount || 0),
    };
  }

  buildVisionAnalysisFromRuntime(runtime) {
    const vision = runtime?.vision;
    if (!vision) return null;

    const sampledFrames = Number(vision.sampledFrames || 0);
    const faceDetectedFrames = Number(vision.faceDetectedFrames || 0);
    const facePresenceRatio = sampledFrames > 0 ? faceDetectedFrames / sampledFrames : 0;
    const averageFaceAreaRatio = faceDetectedFrames > 0 ? vision.totalFaceAreaRatio / faceDetectedFrames : 0;
    const averageCenterOffset = faceDetectedFrames > 0 ? vision.totalCenterOffset / faceDetectedFrames : 1;
    const headMovementRaw = Number(vision.movementAccumulator || 0);
    const centeringScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(averageCenterOffset, 0.75) / 0.75) * 100)));
    const steadinessScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(headMovementRaw, 1.25) / 1.25) * 100)));
    const attentionRiskRatio = sampledFrames > 0
      ? ((vision.warnFrames * 0.5) + vision.dangerFrames) / sampledFrames
      : 0;
    const lowEyeRatio = faceDetectedFrames > 0 ? vision.lowEyeFrames / faceDetectedFrames : 0;
    const movementRiskScore = Math.max(0, Math.min(100, Math.round((Math.min(headMovementRaw, 1.25) / 1.25) * 100)));
    const attentionRiskScore = Math.max(0, Math.min(100, Math.round(attentionRiskRatio * 100)));
    const eyeTensionScore = Math.max(0, Math.min(100, Math.round(lowEyeRatio * 100)));
    const visualTensionScore = Math.max(0, Math.min(100, Math.round(
      (movementRiskScore * 0.35) + (attentionRiskScore * 0.4) + (eyeTensionScore * 0.25)
    )));
    const facePresenceScore = Math.max(0, Math.min(100, Math.round(facePresenceRatio * 100)));
    const focusScore = Math.max(0, Math.min(100, Math.round((facePresenceScore * 0.55) + (centeringScore * 0.45))));
    const dangerFrameRatio = sampledFrames > 0 ? vision.dangerFrames / sampledFrames : 0;

    return {
      status: sampledFrames === 0 ? "unavailable" : (vision.status === "unavailable" ? "limited" : "ready"),
      source: vision.source || "server-python-mediapipe",
      supportiveOverlayUsed: Boolean(vision.supportiveOverlayUsed),
      overview: {
        sampledFrames,
        faceDetectedFrames,
        missingFaceFrames: Math.max(0, sampledFrames - faceDetectedFrames),
        savedSampleCount: Array.isArray(vision.samples) ? vision.samples.length : 0,
        facePresenceRatio: Number(facePresenceRatio.toFixed(4)),
        facePresenceScore,
        focusScore,
        centeringScore,
        steadinessScore,
        averageFaceAreaRatio: Number(averageFaceAreaRatio.toFixed(4)),
        averageCenterOffset: Number(averageCenterOffset.toFixed(4)),
        headMovementRaw: Number(headMovementRaw.toFixed(4)),
      },
      tension: {
        visualTensionScore,
        attentionRiskScore,
        movementRiskScore,
        eyeTensionScore,
        attentionDriftRatio: Number(attentionRiskRatio.toFixed(4)),
        dangerFrameRatio: Number(dangerFrameRatio.toFixed(4)),
        lowEyeRatio: Number(lowEyeRatio.toFixed(4)),
        warnFrames: Number(vision.warnFrames || 0),
        dangerFrames: Number(vision.dangerFrames || 0),
        lowEyeFrames: Number(vision.lowEyeFrames || 0),
      },
      diagnostics: {
        detector: vision.lastResult?.detector || null,
        lastSource: vision.source || "",
        savedSampleCount: Array.isArray(vision.samples) ? vision.samples.length : 0,
      },
      samples: Array.isArray(vision.samples) ? vision.samples : [],
      capturedAt: new Date().toISOString(),
    };
  }

  async ingestCandidateAnswer(sessionId, candidateAnswerAudio = null) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });
    if (!candidateAnswerAudio) throw new AppError("Candidate answer audio is required", { code: "INVALID_ANSWER_AUDIO", statusCode: 400 });

    const runtime = this.getRuntimeState(session);
    const normalizedAnswer = {
      questionIndex: Number(candidateAnswerAudio?.questionIndex || 0),
      mimeType: String(candidateAnswerAudio?.mimeType || "audio/webm"),
      startedAt: Number(candidateAnswerAudio?.startedAt || Date.now()),
      endedAt: Number(candidateAnswerAudio?.endedAt || Date.now()),
      audioBase64: String(candidateAnswerAudio?.audioBase64 || ""),
    };

    if (normalizedAnswer.questionIndex <= 0 || !normalizedAnswer.audioBase64) {
      throw new AppError("Candidate answer audio payload is invalid", { code: "INVALID_ANSWER_AUDIO", statusCode: 400 });
    }

    const answerKey = this.buildAnswerKey(normalizedAnswer);
    const existingAnswerKeys = new Set(runtime.incrementalCandidateAnswerAudios.map((item) => this.buildAnswerKey(item)));
    if (existingAnswerKeys.has(answerKey)) {
      return { accepted: true, duplicate: true };
    }

    runtime.incrementalCandidateAnswerAudios.push(normalizedAnswer);

    let savedAudioFile = null;
    if (this.reportArchive?.saveIncrementalCandidateAnswerAudio) {
      savedAudioFile = await this.reportArchive.saveIncrementalCandidateAnswerAudio({
        sessionId,
        candidateAnswerAudio: normalizedAnswer,
      });
      if (savedAudioFile) {
        runtime.incrementalSavedAudioFiles = this.mergeUniqueSavedAudioFiles(
          runtime.incrementalSavedAudioFiles,
          [savedAudioFile]
        );
      }
    }

    if (this.pythonAnalysisClient && savedAudioFile?.fullPath) {
      const wavPath = await this.pythonAnalysisClient.convertToWav(savedAudioFile.fullPath);
      if (wavPath && !runtime.analyzedAudioRelativePaths.includes(savedAudioFile.relativePath)) {
        this.pythonAnalysisClient.analyzeAudioFiles({
          sessionId,
          filePaths: [wavPath],
          writeTextReport: true,
          finalizeReport: false,
        })
          .then((success) => {
            if (success && !runtime.analyzedAudioRelativePaths.includes(savedAudioFile.relativePath)) {
              runtime.analyzedAudioRelativePaths.push(savedAudioFile.relativePath);
            }
          })
          .catch((err) => console.error("[BackendOrchestrator] Incremental audio analysis error:", err));
      }
    }

    await this.sessions.update(session);
    return { accepted: true, duplicate: false };
  }

  async endSession(sessionId, reason = null, transcript = [], candidateAnswerAudios = [], visionAnalysis = null) {
    const existingSession = await this.sessions.findById(sessionId);
    const session = existingSession || {
      id: sessionId,
      state: SessionState.IN_PROGRESS,
      report: null,
      end() {
        this.state = SessionState.ENDING;
      },
    };

    if (existingSession && (session.state === SessionState.COMPLETED || session.state === SessionState.ABORTED)) {
      if (session.report) return session.report;
    }

    session.end();
    const runtime = this.getRuntimeState(session);
    const mergedCandidateAnswerAudios = this.mergeUniqueAnswers(
      runtime.incrementalCandidateAnswerAudios,
      candidateAnswerAudios
    );
    const hasCandidateTranscript = Array.isArray(transcript)
      && transcript.some((item) => item?.role === "candidate" && String(item?.text || "").trim());
    const fallbackTranscriptEntries = hasCandidateTranscript
      ? []
      : await this.buildFallbackTranscriptEntries(mergedCandidateAnswerAudios);
    const transcriptEntries = this.mergeUniqueTranscriptEntries(transcript, fallbackTranscriptEntries);
    const effectiveVisionAnalysis = visionAnalysis || this.buildVisionAnalysisFromRuntime(runtime);
    const report = await this.analyzer.generateReport(session, transcriptEntries, effectiveVisionAnalysis);
    const transcriptText = transcriptEntries
      .map((item) => {
        const role = item?.role === "interviewer" ? "Interviewer" : "Candidate";
        return `[${role}] ${String(item?.text || "").trim()}`;
      })
      .filter(Boolean)
      .join("\n");

    report.transcript = transcriptEntries;
    report.transcriptText = transcriptText;
    report.sessionConfig = {
      role: session.config?.role || "",
      mode: session.config?.mode || "",
      interviewType: session.config?.interviewType || "",
    };
    report.tokenUsage = session?.tokenUsage || null;
    report.estimatedCost = this.costEstimator
      ? this.costEstimator.estimate(session?.tokenUsage || null)
      : null;

    session.report = report;
    session.state = reason ? SessionState.ABORTED : SessionState.COMPLETED;

    if (existingSession) {
      await this.sessions.update(session);
    }
    if (this.reportArchive?.saveSessionConfig) {
      await this.reportArchive.saveSessionConfig({ sessionId, sessionConfig: session.config });
    }
    await this.reports.save(report);

    if (this.reportArchive?.save) {
      const archiveResult = await this.reportArchive.save({
        sessionId,
        transcript: transcriptEntries,
        report,
        candidateAnswerAudios: mergedCandidateAnswerAudios,
        existingCandidateAnswerAudioFiles: runtime.incrementalSavedAudioFiles,
        visionAnalysis: effectiveVisionAnalysis,
      });

      if (this.pythonAnalysisClient && archiveResult) {
        // Final pass only finalizes the audio report from existing incremental artifacts.
        // Do not resend the full set of answer files through the audio model at session end.
        await this.pythonAnalysisClient.analyzeSessionAndTranscript({
          sessionId,
          baseDir: this.reportArchive.baseDir,
          candidateAnswerAudioFiles: archiveResult.savedCandidateAnswerAudioFiles || [],
          transcriptText: archiveResult.transcriptText || transcriptText,
          report: report,
          visionAnalysis: archiveResult.visionArtifacts,
          interviewType: session.config?.interviewType || "Technical",
          finalizeAudioFromExisting: true,
        }).catch(err => console.error("[BackendOrchestrator] PythonAnalysisClient Error:", err));
      }
    }

    return report;
  }

  async getReport(sessionId) {
    const report = await this.reports.findBySessionId(sessionId);
    const feedbackArtifacts = this.reportArchive?.loadFeedbackArtifacts
      ? await this.reportArchive.loadFeedbackArtifacts(sessionId)
      : null;

    if (!report && !feedbackArtifacts) {
      throw new AppError("Report not found", { code: "REPORT_NOT_FOUND", statusCode: 404 });
    }

    if (!report) {
      const overallScore =
        feedbackArtifacts?.transcriptAnalysis?.overallScore
        ?? feedbackArtifacts?.transcriptAnalysis?.overall?.overallScore
        ?? 0;
      return {
        id: `R-${sessionId}`,
        sessionId,
        overallScore,
        content: [],
        communication: [],
        behavioral: [],
        recommendations: [],
        notes: [],
        qaEvaluations: feedbackArtifacts?.transcriptAnalysis?.qaEvaluations || [],
        transcript: [],
        transcriptText: feedbackArtifacts?.transcriptText || "",
        visionAnalysis: feedbackArtifacts?.visionAnalysis || null,
        sessionConfig: feedbackArtifacts?.sessionConfig || null,
        feedbackArtifacts,
        tokenUsage: null,
        estimatedCost: null,
      };
    }

    return {
      ...report,
      sessionConfig: report?.sessionConfig || feedbackArtifacts?.sessionConfig || null,
      transcriptText: feedbackArtifacts?.transcriptText || report?.transcriptText || "",
      visionAnalysis: feedbackArtifacts?.visionAnalysis || report?.visionAnalysis || null,
      feedbackArtifacts,
    };
  }

  async listReports({ limit = 50 } = {}) {
    if (!this.reportArchive?.listSessionSummaries) return [];
    return await this.reportArchive.listSessionSummaries({ limit });
  }

  async getHistoryInsights({ limit = 3 } = {}) {
    const summaries = await this.listReports({ limit: Math.max(limit, 3) });
    const sorted = [...summaries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const reports = [];
    for (const summary of sorted) {
      try {
        const report = await this.getReport(summary.sessionId);
        reports.push({ summary, report });
      } catch (error) {
        this.logger?.warn?.("Failed to load report for history insights", { sessionId: summary.sessionId, error: error?.message });
      }
    }

    const tagMap = new Map();
    for (const item of reports) {
      const qaEvaluations = Array.isArray(item?.report?.feedbackArtifacts?.transcriptAnalysis?.qaEvaluations)
        ? item.report.feedbackArtifacts.transcriptAnalysis.qaEvaluations
        : [];

      const grouped = new Map();
      for (const qa of qaEvaluations) {
        const tag = String(qa?.questionType || "").trim();
        if (!tag || tag === "meta" || qa?.visibleInReport === false || qa?.excludedFromOverall === true) continue;
        const score = Number(qa?.score);
        if (!Number.isFinite(score)) continue;
        const bucket = grouped.get(tag) || [];
        bucket.push(score);
        grouped.set(tag, bucket);
      }

      for (const [tag, scores] of grouped.entries()) {
        const avgScore = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
        const bucket = tagMap.get(tag) || [];
        bucket.push({
          sessionId: item.summary.sessionId,
          createdAt: item.summary.createdAt,
          score: avgScore,
        });
        tagMap.set(tag, bucket);
      }
    }

    const labelMap = {
      self_presentation: "Kendini Tanitma",
      motivation: "Motivasyon",
      behavioral: "Davranissal",
      experience: "Deneyim",
      technical_knowledge: "Teknik Bilgi",
      technical_experience: "Teknik Deneyim",
      problem_solving: "Problem Cozme",
    };

    const requiredSessionCount = reports.length;
    const trendMetrics = Array.from(tagMap.entries())
      .filter(([, points]) => points.length === requiredSessionCount && requiredSessionCount > 0)
      .map(([tag, points]) => {
        const ordered = [...points].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const scores = ordered.map((point) => point.score);
        const latestScore = scores[scores.length - 1] || 0;
        const delta = scores.length >= 2 ? latestScore - scores[0] : 0;
        return {
          tag,
          label: labelMap[tag] || String(tag).replaceAll("_", " "),
          scores,
          latestScore,
          delta,
        };
      })
      .sort((a, b) => a.latestScore - b.latestScore || a.delta - b.delta)
      .slice(0, 4);

    const payloadForGpt = {
      recentReports: reports.map(({ summary, report }) => ({
        sessionId: summary.sessionId,
        createdAt: summary.createdAt,
        overallScore: Number(summary.overallScore || report?.overallScore || 0),
        transcriptOverallScore: Number(report?.feedbackArtifacts?.transcriptAnalysis?.overall?.overallScore || report?.feedbackArtifacts?.transcriptAnalysis?.overallScore || 0),
        strengths: report?.feedbackArtifacts?.transcriptAnalysis?.overall?.strengths || [],
        improvementAreas: report?.feedbackArtifacts?.transcriptAnalysis?.overall?.improvementAreas || [],
        focusTopics: report?.feedbackArtifacts?.transcriptAnalysis?.overall?.focusTopics || [],
      })),
      trendMetrics,
    };

    const commentary = await this.ai.generateHistoryInsights(payloadForGpt);

    return {
      recentReports: payloadForGpt.recentReports,
      trendMetrics,
      commentary,
    };
  }
}
