export class InterviewFlowPolicy {
  supportiveRules() {
    return { requireGentleHints: true, strictNeutrality: false };
  }

  neutralRules() {
    return { requireGentleHints: false, strictNeutrality: true };
  }
}
