import { InterviewSession } from "../domain/entities/InterviewSession.js";
import { SessionState } from "../domain/enums/SessionState.js";
import { SessionConfig } from "../domain/value-objects/SessionConfig.js";
import { Consent } from "../domain/value-objects/Consent.js";
import { AppError } from "../domain/errors/AppError.js";

export class BackendOrchestrator {
  constructor({ sessions, reports, ai, analyzer, guardrails, realtimeManager, idGenerator, reportArchive, candidateAudioTranscriber = null }) {
    this.sessions = sessions;
    this.reports = reports;
    this.ai = ai;
    this.analyzer = analyzer;
    this.guardrails = guardrails;
    this.realtimeManager = realtimeManager;
    this.idGenerator = idGenerator;
    this.reportArchive = reportArchive;
    this.candidateAudioTranscriber = candidateAudioTranscriber;
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


  hasCandidateTranscript(transcript = []) {
    return (Array.isArray(transcript) ? transcript : []).some(
      (item) => item?.role === "candidate" && String(item?.text || "").trim().length > 0
    );
  }

  async enrichTranscriptWithCandidateAudio(transcript = [], candidateAnswerAudios = []) {
    const base = Array.isArray(transcript) ? [...transcript] : [];
    if (this.hasCandidateTranscript(base)) return base;
    if (!this.candidateAudioTranscriber?.transcribeCandidateAnswerAudios) return base;

    const transcribed = await this.candidateAudioTranscriber.transcribeCandidateAnswerAudios(candidateAnswerAudios);
    if (!Array.isArray(transcribed) || transcribed.length === 0) return base;

    return [...base, ...transcribed].sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
  }

  async endSession(sessionId, reason = null, transcript = [], candidateAnswerAudios = []) {
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
    const transcriptEntries = await this.enrichTranscriptWithCandidateAudio(transcript, candidateAnswerAudios);
    const report = await this.analyzer.generateReport(session, transcriptEntries);
    const transcriptText = transcriptEntries
      .map((item) => {
        const role = item?.role === "interviewer" ? "Interviewer" : "Candidate";
        const sttSource = String(item?.source || "").trim();
        const sttModel = String(item?.model || "").trim();
        const sttMeta = sttSource || sttModel ? ` [stt-source:${sttSource || "unknown"}; model:${sttModel || "unknown"}]` : "";
        return `[${role}] ${String(item?.text || "").trim()}${sttMeta}`;
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
      await this.reportArchive.save({
        sessionId,
        transcript: transcriptEntries,
        report,
        candidateAnswerAudios,
      });
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
