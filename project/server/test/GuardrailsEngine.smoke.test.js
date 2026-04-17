import { describe, expect, it } from "vitest";
import { GuardrailsEngine } from "../src/orchestration/GuardrailsEngine.js";
import { InterviewFlowPolicy } from "../src/orchestration/InterviewFlowPolicy.js";
import { SessionState } from "../src/domain/enums/SessionState.js";

describe("GuardrailsEngine smoke", () => {
  const engine = new GuardrailsEngine({ policy: new InterviewFlowPolicy() });

  it("[STC-03] rejects missing mandatory consent", () => {
    expect(() => engine.enforceRequiredConsent({ microphone: true, camera: false })).toThrow(
      "Microphone and camera consent are mandatory"
    );
  });

  it("[ITC-01] rejects invalid session states for start", () => {
    expect(() => engine.enforceStateForStart({ state: SessionState.ABORTED })).toThrow(
      "Session is not ready to start"
    );
  });

  it("[ITC-01] allows supported session states for start", () => {
    expect(() => engine.enforceStateForStart({ state: SessionState.CONSENT_GRANTED })).not.toThrow();
  });
});
