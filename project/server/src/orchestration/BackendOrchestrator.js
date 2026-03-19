import { InterviewSession } from "../domain/entities/InterviewSession.js";
import { SessionState } from "../domain/enums/SessionState.js";
import { SessionConfig } from "../domain/value-objects/SessionConfig.js";
import { Consent } from "../domain/value-objects/Consent.js";
import { AppError } from "../domain/errors/AppError.js";

export class BackendOrchestrator {
  constructor({ sessions, reports, ai, analyzer, guardrails, realtimeManager, idGenerator, reportArchive, candidateAudioTranscriber = null, pythonAnalysisClient = null }) {
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
    const report = await this.analyzer.generateReport(session, transcriptEntries, visionAnalysis);
    const transcriptText = transcriptEntries
      .map((item) => {
        const role = item?.role === "interviewer" ? "Interviewer" : "Candidate";
        return `[${role}] ${String(item?.text || "").trim()}`;
      })
      .filter(Boolean)
      .join("\n");

    report.transcript = transcriptEntries;
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
        transcript: transcriptEntries,
        report,
        candidateAnswerAudios: mergedCandidateAnswerAudios,
        existingCandidateAnswerAudioFiles: runtime.incrementalSavedAudioFiles,
        visionAnalysis,
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
          report: report
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

    return report;
  }
}
