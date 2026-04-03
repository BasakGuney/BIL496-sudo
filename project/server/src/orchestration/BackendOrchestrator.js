import { InterviewSession } from "../domain/entities/InterviewSession.js";
import { SessionState } from "../domain/enums/SessionState.js";
import { SessionConfig } from "../domain/value-objects/SessionConfig.js";
import { Consent } from "../domain/value-objects/Consent.js";
import { AppError } from "../domain/errors/AppError.js";

export class BackendOrchestrator {
  constructor({ sessions, reports, ai, analyzer, guardrails, realtimeManager, idGenerator, reportArchive, candidateAudioTranscriber = null, pythonAnalysisClient = null, visionFrameAnalyzer = null }) {
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
  }

  async createSession(cfgInput, offerSdp = "", sessionId = null) {
    const cfg = cfgInput instanceof SessionConfig ? cfgInput : new SessionConfig(cfgInput);
    const id = sessionId || this.idGenerator.newId();
    const answerSdp = offerSdp ? await this.realtimeManager.createOfferAnswer(id, offerSdp, cfg) : "";

    const session = new InterviewSession({
      id,
      state: SessionState.CONFIGURED,
      config: cfg,
      offerSdp,
      answerSdp,
    });

    await this.sessions.create(session);
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
    session.start();
    await this.sessions.update(session);

    const firstQuestion = await this.ai.generateFirstQuestion(session.config);
    return { turnIndex: 1, questionText: firstQuestion, sessionId };
  }

  async generatePreviewQuestions(cfgInput) {
    const cfg = cfgInput instanceof SessionConfig ? cfgInput : new SessionConfig(cfgInput);
    return await this.ai.generatePreviewQuestions(cfg);
  }

  async generateLiveHints(question) {
    return await this.ai.generateLiveHints(question);
  }

  async generateLiveFeedback(question, answer) {
    return await this.ai.generateLiveFeedback(question, answer);
  }

  buildAnswerKey(answer = {}) {
    return [
      Number(answer?.questionIndex || 0),
      Number(answer?.startedAt || 0),
      Number(answer?.endedAt || 0),
    ].join(":");
  }

  getRuntimeState(session) {
    if (!session.runtimeState) {
      session.runtimeState = {
        incrementalCandidateAnswerAudios: [],
        incrementalSavedAudioFiles: [],
        analyzedAudioRelativePaths: [],
        vision: {
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
        },
      };
    }

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

  normalizeTranscriptText(text = "") {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  mergeTranscriptWithCandidateAudio(transcriptEntries = [], transcribedCandidateTurns = []) {
    const merged = (Array.isArray(transcriptEntries) ? transcriptEntries : []).map((item) => ({ ...item }));
    const candidateIndexes = merged
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item?.role === "candidate")
      .map(({ index }) => index);
    const usedCandidateIndexes = new Set();

    const normalizedTurns = (Array.isArray(transcribedCandidateTurns) ? transcribedCandidateTurns : [])
      .map((turn) => ({
        role: "candidate",
        text: String(turn?.text || "").trim(),
        ts: Number(turn?.ts || Date.now()),
        source: "candidate_audio_transcription",
      }))
      .filter((turn) => turn.text.length > 0)
      .sort((a, b) => a.ts - b.ts);

    for (const turn of normalizedTurns) {
      let bestIndex = -1;
      let bestDiff = Number.POSITIVE_INFINITY;

      for (const candidateIndex of candidateIndexes) {
        if (usedCandidateIndexes.has(candidateIndex)) continue;
        const current = merged[candidateIndex];
        const diff = Math.abs(Number(current?.ts || 0) - turn.ts);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIndex = candidateIndex;
        }
      }

      const canReplaceExisting = bestIndex >= 0 && bestDiff <= 30000;
      if (canReplaceExisting) {
        const existing = merged[bestIndex];
        const existingNorm = this.normalizeTranscriptText(existing?.text || "");
        const transcribedNorm = this.normalizeTranscriptText(turn.text);
        const shouldReplace = Boolean(transcribedNorm) && existingNorm !== transcribedNorm;
        if (shouldReplace) {
          merged[bestIndex] = {
            ...existing,
            text: turn.text,
            source: "candidate_audio_transcription",
          };
        }
        usedCandidateIndexes.add(bestIndex);
        continue;
      }

      merged.push(turn);
    }

    return this.mergeUniqueTranscriptEntries(merged);
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
    const transcriptEntries = this.mergeUniqueTranscriptEntries(transcript);
    let effectiveTranscriptEntries = transcriptEntries;
    if (this.candidateAudioTranscriber && mergedCandidateAnswerAudios.length > 0) {
      const transcribedCandidateTurns = await this.candidateAudioTranscriber
        .transcribeCandidateAnswerAudios(mergedCandidateAnswerAudios)
        .catch(() => []);
      if (transcribedCandidateTurns.length > 0) {
        effectiveTranscriptEntries = this.mergeTranscriptWithCandidateAudio(
          transcriptEntries,
          transcribedCandidateTurns
        );
      }
    }
    const effectiveVisionAnalysis = visionAnalysis || this.buildVisionAnalysisFromRuntime(runtime);
    const report = await this.analyzer.generateReport(session, effectiveTranscriptEntries, effectiveVisionAnalysis);
    const transcriptText = effectiveTranscriptEntries
      .map((item) => {
        const role = item?.role === "interviewer" ? "Interviewer" : "Candidate";
        return `[${role}] ${String(item?.text || "").trim()}`;
      })
      .filter(Boolean)
      .join("\n");

    report.transcript = effectiveTranscriptEntries;
    report.transcriptText = transcriptText;

    session.report = report;
    session.state = reason ? SessionState.ABORTED : SessionState.COMPLETED;

    if (existingSession) {
      await this.sessions.update(session);
    }
    await this.reports.save(report);

    if (this.reportArchive?.save) {
      const archiveResult = await this.reportArchive.save({
        sessionId,
        transcript: effectiveTranscriptEntries,
        report,
        candidateAnswerAudios: mergedCandidateAnswerAudios,
        existingCandidateAnswerAudioFiles: runtime.incrementalSavedAudioFiles,
        visionAnalysis: effectiveVisionAnalysis,
      });

      if (this.pythonAnalysisClient && archiveResult) {
        // Only send any still-unprocessed answer files here. Incremental uploads are already
        // analyzed one by one during the interview, and the Python layer appends/merges those
        // item-level results into the session artifacts.
        this.pythonAnalysisClient.analyzeSessionAndTranscript({
          sessionId,
          baseDir: this.reportArchive.baseDir,
          candidateAnswerAudioFiles: (archiveResult.savedCandidateAnswerAudioFiles || []).filter(
            (file) => !runtime.analyzedAudioRelativePaths.includes(file?.relativePath)
          ),
          transcriptText: archiveResult.transcriptText || transcriptText,
          report: report,
          visionAnalysis: archiveResult.visionArtifacts,
          interviewType: session.config?.interviewType || "Technical"
        }).catch(err => console.error("[BackendOrchestrator] PythonAnalysisClient Error:", err));
      }
    }

    return report;
  }

  async getReport(sessionId) {
    const report = await this.reports.findBySessionId(sessionId);
    if (!report) {
      throw new AppError("Report not found", { code: "REPORT_NOT_FOUND", statusCode: 404 });
    }

    const feedbackArtifacts = this.reportArchive?.loadFeedbackArtifacts
      ? await this.reportArchive.loadFeedbackArtifacts(sessionId)
      : null;

    return {
      ...report,
      transcriptText: feedbackArtifacts?.transcriptText || report?.transcriptText || "",
      visionAnalysis: feedbackArtifacts?.visionAnalysis || report?.visionAnalysis || null,
      feedbackArtifacts,
    };
  }
}
