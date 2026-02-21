import { AppError } from "../../utils/AppError.js";
import { InterviewSession } from "../../domain/entities/InterviewSession.js";
import { SessionState } from "../../domain/enums/SessionState.js";
import { Question } from "../../domain/entities/Question.js";
import { AnswerTurn } from "../../domain/entities/AnswerTurn.js";

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
    const preparedQuestions = await this.ai.generateQuestionPlan(cfg, 6);
    const session = new InterviewSession({
      id: this.idGenerator.newId("S"),
      config: cfg,
      state: SessionState.Configured,
      preparedQuestions,
    });
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

    const firstPrepared = session.preparedQuestions.find((q) => !session.questions.some((asked) => asked.text === q));
    const questionText = firstPrepared || (await this.ai.generateFirstQuestion(session));
    const allocatedTimeSec = session.config.interviewType === "HR" ? 120 : 150;
    session.questions.push(new Question({ id: this.idGenerator.newId("Q"), text: questionText, allocatedTimeSec }));

    await this.sessions.update(session);
    return { sessionId: session.id, turnIndex: 1, questionText, status: "asked", allocatedTimeSec };
  }

  async recordAnswer(sessionId, { transcript = "", durationSec = 0 } = {}) {
    const session = await this.#getSessionOrThrow(sessionId);
    if (session.questions.length === 0) {
      throw new AppError("No active question found", { statusCode: 409, code: "NO_ACTIVE_QUESTION" });
    }

    const activeQuestion = session.questions[session.questions.length - 1];
    const relevanceScore = this.#estimateRelevance(session.config, transcript);

    const answerTurn = new AnswerTurn({
      id: this.idGenerator.newId("A"),
      questionId: activeQuestion.id,
      transcript,
      durationSec,
      relevanceScore,
      summary: transcript.slice(0, 140),
    });
    session.answerTurns.push(answerTurn);

    const overtime = durationSec > activeQuestion.allocatedTimeSec;
    let nextPrompt = null;

    if (session.questions.length < Math.max(5, session.preparedQuestions.length)) {
      nextPrompt = overtime
        ? "Anladım bu kadarı yeterli, isterseniz devam edelim."
        : await this.ai.generateNextQuestion(session);

      session.questions.push(new Question({
        id: this.idGenerator.newId("Q"),
        text: nextPrompt,
        allocatedTimeSec: session.config.interviewType === "HR" ? 120 : 150,
      }));
    }

    await this.sessions.update(session);

    return {
      sessionId,
      relevanceScore,
      overtime,
      spokenInterruption: overtime ? "Anladım bu kadarı yeterli, isterseniz devam edelim." : null,
      nextQuestion: nextPrompt,
    };
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
    if (!report) throw new AppError("Report not found", { statusCode: 404, code: "REPORT_NOT_FOUND" });
    return report;
  }

  async getSession(sessionId) {
    return this.#getSessionOrThrow(sessionId);
  }

  #estimateRelevance(config, transcript) {
    const text = String(transcript || "").toLowerCase();
    const targets = [config.role, config.domainInterest, config.companyOrIndustry].map((v) => String(v || "").toLowerCase());
    const hits = targets.filter((target) => target && text.includes(target)).length;
    return Math.min(100, 50 + hits * 15);
  }

  async #getSessionOrThrow(sessionId) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new AppError("Session not found", { statusCode: 404, code: "SESSION_NOT_FOUND" });
    return session;
  }
}
