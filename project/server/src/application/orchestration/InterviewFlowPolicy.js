export class InterviewFlowPolicy {
  supportiveRules() {
    return { redirection: "gentle", uncertaintyHelp: true };
  }

  neutralRules() {
    return { redirection: "strict", uncertaintyHelp: false };
  }
}
