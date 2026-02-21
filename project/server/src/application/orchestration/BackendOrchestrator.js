import { InterviewSession } from "../../domain/entities/InterviewSession.js";
import { SessionState } from "../../domain/entities/SessionState.js";
import { SessionConfig } from "../../domain/value-objects/SessionConfig.js";
import { Consent } from "../../domain/value-objects/Consent.js";
import { AppError } from "../../domain/errors/AppError.js";

export class BackendOrchestrator {
  constructor({ sessions, reports, ai, analyzer, guardrails, realtimeManager, idGenerator, reportArchive }) {
    this.sessions = sessions;
    this.reports = reports;
    this.ai = ai;
    this.analyzer = analyzer;
    this.guardrails = guardrails;
    this.realtimeManager = realtimeManager;
    this.idGenerator = idGenerator;
    this.reportArchive = reportArchive;
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

  async endSession(sessionId, reason = null, transcript = []) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { code: "SESSION_NOT_FOUND", statusCode: 404 });

    session.end();
    const report = await this.analyzer.generateReport(session, transcript);
    session.report = report;
    session.state = reason ? SessionState.ABORTED : SessionState.COMPLETED;

    await this.sessions.update(session);
    await this.reports.save(report);

    if (this.reportArchive?.save) {
      await this.reportArchive.save({ sessionId, transcript, report });
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
