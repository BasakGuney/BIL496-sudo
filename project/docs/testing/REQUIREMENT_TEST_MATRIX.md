# Requirement Test Matrix

Statuses use `planned`, `implemented`, or `manual`.

| Requirement ID | Requirement | Test Case(s) | Execution Type | Evidence Source | Status | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| FR-01 | Select interview type (HR/Technical) | UTC-01, ITC-01, STC-01 | automated-smoke + manual | `server/test/sessionRoutes.smoke.test.js`, manual checklist | implemented | project team |
| FR-02 | Provide role and context info | UTC-01, ITC-01, STC-01 | automated-smoke + manual | `server/test/sessionRoutes.smoke.test.js`, manual checklist | implemented | project team |
| FR-03 | Select domain and difficulty | UTC-01, ITC-01, ITC-02 | automated-smoke + manual | `server/test/sessionRoutes.smoke.test.js`, manual checklist | implemented | project team |
| FR-04 | Support Supportive and Neutral modes | UTC-01, ITC-04, STC-02 | automated-smoke + manual | `server/test/sessionRoutes.smoke.test.js`, manual checklist | implemented | project team |
| FR-05 | Run voice interview (10–15 min) | STC-01 | manual | manual checklist | manual | project team |
| FR-06 | Capture speech and transcribe (STT) | UTC-07, ITC-03 | automated-smoke + manual | `server/test/BackendOrchestrator.smoke.test.js`, manual checklist | implemented | project team |
| FR-07 | Generate questions and follow-ups | ITC-02, ITC-03, ITC-04 | automated-smoke + manual | `server/test/sessionRoutes.smoke.test.js`, manual checklist | implemented | project team |
| FR-08 | Enforce answer time limits | UTC-02, ITC-03 | manual | manual checklist | manual | project team |
| FR-09 | Supportive: redirect off-topic answers | UTC-03, ITC-04, STC-02 | automated-smoke + manual | `server/test/sessionRoutes.smoke.test.js`, manual checklist | implemented | project team |
| FR-10 | Supportive: help with uncertainty | UTC-04, ITC-04, STC-02 | automated-smoke + manual | `server/test/sessionRoutes.smoke.test.js`, manual checklist | implemented | project team |
| FR-11 | Generate feedback report with scores | UTC-05, STC-01, STC-02 | automated-smoke + manual | `project/client/src/test/FeedbackPage.smoke.test.tsx`, manual checklist | implemented | project team |
| FR-12 | Provide interviewer voice (TTS) | UTC-08, ITC-02 | manual | manual checklist | manual | project team |
| FR-13 | Use camera (with consent) for signals | STC-05 | automated-smoke + manual | `project/client/src/test/FeedbackPage.smoke.test.tsx`, manual checklist | implemented | project team |
| NFR-01 | Simple guided user flow | UAT-01, STC-04 | automated-smoke + manual | `project/client/src/test/App.smoke.test.tsx`, manual checklist | implemented | project team |
| NFR-02 | Responsive live interaction | PTC-01 | manual | manual checklist | manual | project team |
| NFR-03 | Graceful degradation on failures | UTC-05, PTC-03 | automated-smoke | `server/test/PythonAnalysisClient.smoke.test.js` | implemented | project team |
| NFR-04 | Consent + no exposed API keys | STC-03, UTC-06 | automated-smoke | `project/client/src/test/SessionSetupForm.smoke.test.tsx`, `project/client/src/test/api.smoke.test.ts` | implemented | project team |
| NFR-05 | Modular and maintainable design | UTC-05 | automated-smoke | smoke suite + cleanup review | implemented | project team |
| UIR-01 | Setup screen available | ITC-01, STC-04 | automated-smoke | `project/client/src/test/App.smoke.test.tsx` | implemented | project team |
| UIR-02 | Interview screen available | ITC-03, STC-04 | automated-smoke + manual | `project/client/src/test/App.smoke.test.tsx`, manual checklist | implemented | project team |
| UIR-03 | Feedback screen available | STC-01, STC-04 | automated-smoke + manual | `project/client/src/test/App.smoke.test.tsx`, manual checklist | implemented | project team |
| HIR-01 | Microphone integration (required) | STC-03, ITC-03 | automated-smoke + manual | `project/client/src/test/SessionSetupForm.smoke.test.tsx`, manual checklist | implemented | project team |
| HIR-02 | Camera integration | STC-05 | manual | manual checklist | manual | project team |
| SIR-01 | External AI services integration | ITC-02, ITC-03 | manual | manual checklist | manual | project team |
| SIR-02 | AI calls only via backend | UTC-06 | automated-smoke | `project/client/src/test/api.smoke.test.ts` | implemented | project team |
| PR-01 | Session time meets target | STC-01 | manual | manual checklist | manual | project team |
| PR-02 | Turn latency acceptable | PTC-01 | manual | manual checklist | manual | project team |
| PR-03 | Report generation fast enough | PTC-02 | manual | manual checklist | manual | project team |
| PR-04 | Degrade gracefully under issues | UTC-05, PTC-03 | automated-smoke | `server/test/PythonAnalysisClient.smoke.test.js` | implemented | project team |
| PR-05 | Bounded AI call rate (cost) | PTC-04 | manual | manual checklist | manual | project team |
