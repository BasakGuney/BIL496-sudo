import { AppError } from "../../utils/AppError.js";
import { SessionState } from "../../domain/enums/SessionState.js";

export class GuardrailsEngine {
  constructor(policy) {
    this.policy = policy;
  }

  enforceRequiredConsent(consent) {
    if (!consent?.microphone || !consent?.camera) {
      throw new AppError("Microphone and camera consent are required", { statusCode: 400, code: "CONSENT_REQUIRED" });
    }
  }

  enforceStateForStart(session) {
    const allowed = [SessionState.Configured, SessionState.ConsentGranted, SessionState.Ready];
    if (!allowed.includes(session.state)) {
      throw new AppError("Session state is not valid for start", { statusCode: 409, code: "INVALID_SESSION_STATE" });
    }
    return session.config.mode === "Supportive" ? this.policy.supportiveRules() : this.policy.neutralRules();
  }
}
