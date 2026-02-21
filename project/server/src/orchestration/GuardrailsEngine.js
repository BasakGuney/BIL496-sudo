import { AppError } from "../domain/errors/AppError.js";
import { SessionState } from "../domain/enums/SessionState.js";

export class GuardrailsEngine {
  constructor({ policy }) {
    this.policy = policy;
  }

  enforceRequiredConsent(consent) {
    if (!consent?.microphone || !consent?.camera) {
      throw new AppError("Microphone and camera consent are mandatory", {
        code: "CONSENT_REQUIRED",
        statusCode: 400,
      });
    }
  }

  enforceStateForStart(session) {
    const allowed = [SessionState.CONSENT_GRANTED, SessionState.READY, SessionState.CONFIGURED];
    if (!allowed.includes(session.state)) {
      throw new AppError("Session is not ready to start", {
        code: "INVALID_SESSION_STATE",
        statusCode: 409,
      });
    }
  }
}
