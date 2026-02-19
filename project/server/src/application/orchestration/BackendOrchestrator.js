import { AppError } from "../../utils/AppError.js";
import { InterviewSession } from "../../domain/entities/InterviewSession.js";
import { SessionState } from "../../domain/enums/SessionState.js";
import { Question } from "../../domain/entities/Question.js";

export class BackendOrchestrator {
  constructor({ sessions, reports, ai, analyzer, guardrails, idGenerator }) {
    this.sessions = sessions;
    this.reports = reports;
    this.ai = ai;
    this.analyzer = analyzer;
    this.guardrails = guardrails;
    this.idGenerator = idGenerator;
  }

  async createSession(cfg) {
    const session = new InterviewSession({ id: this.idGenerator.newId("S"), config: cfg, state: SessionState.Configured });
    await this.sessions.create(session);
    return session;
  }

  async updateConsent(sessionId, consent) {
    const session = await this.#getSessionOrThrow(sessionId);
    session.consent = consent;
    session.state = SessionState.ConsentGranted;
    await this.sessions.update(session);
    return session;
  }

  async startSession(sessionId) {
    const session = await this.#getSessionOrThrow(sessionId);
    this.guardrails.enforceRequiredConsent(session.consent);
    this.guardrails.enforceStateForStart(session);
    session.start();
    const questionText = await this.ai.generateFirstQuestion(session.config);
    session.questions.push(new Question({ id: this.idGenerator.newId("Q"), text: questionText }));
    await this.sessions.update(session);
    return { sessionId: session.id, turnIndex: 1, questionText, status: "asked" };
  }

  async endSession(sessionId, _reason = null) {
    const session = await this.#getSessionOrThrow(sessionId);
    session.state = SessionState.Ending;
    const report = await this.analyzer.generateReport(session);
    session.state = SessionState.ReportReady;
    session.end();
    await this.reports.save(report);
    await this.sessions.update(session);
    return report;
  }

  async getReport(sessionId) {
    const report = await this.reports.findBySessionId(sessionId);
    if (!report) {
      throw new AppError("Report not found", { statusCode: 404, code: "REPORT_NOT_FOUND" });
    }
    return report;
  }

  async getSession(sessionId) {
    return this.#getSessionOrThrow(sessionId);
  }

  async #getSessionOrThrow(sessionId) {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new AppError("Session not found", { statusCode: 404, code: "SESSION_NOT_FOUND" });
    }
    return session;
  }
}
