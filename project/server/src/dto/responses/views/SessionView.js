import { SessionConfigView } from "./SessionConfigView.js";
import { ConsentView } from "./ConsentView.js";

export class SessionView {
  static fromSession(session) {
    return {
      sessionId: session.id,
      state: session.state,
      config: SessionConfigView.fromConfig(session.config),
      consent: ConsentView.fromConsent(session.consent),
    };
  }
}
