4.1 Unit Testing
Goal: Verify that each backend and frontend package works correctly in isolation by testing internal logic, validation rules, and data processing using mocked external dependencies.
Unit tests focus on:
validation of interview configuration
guardrail rule evaluation (time limits, off-topic detection, uncertainty detection)
behavioral signal computations
feedback report generation logic
correct STT/TTS invocation
correct request validation and error handling
frontend component logic and state transitions

These tests ensure that individual modules behave correctly before integration.

Backend packages
domain/ (models, enums, dto)
Validate data structures, validation rules, DTO mapping, and serialization/deserialization.

orchestration/ (GuardrailsEngine, InterviewFlowPolicy)
Unit test guardrail rules: time-bound checks, uncertainty phrase detection, off-topic detection heuristics.

orchestration/ (BackendOrchestrator, InterviewFlowPolicy)
Unit test decision logic for turn flow (neutral vs supportive), question progression, and intervention selection using mocked AI and policy outputs.

services/ai/ (AIServiceGateway, OpenAIClientAdapter, OpenAiRealtimeGateway)
Unit test gateway/adapters for correct request formatting, error handling, retries/backoff, and safe fallbacks (no real external calls).

services/analysis/ (BehaviorAnalyzer, AudioSignalProcessor, VisionSignalProcessor, TranscriptEvaluator, PythonAnalysisClient)
Unit test behavioral signal computations (filler rate, pause rate, speaking rate, engagement proxies) using synthetic transcript/video summaries.

api/controllers/ & persistence/storage/ (FileReportArchive)
Unit test report assembly, scoring, recommendation generation, and graceful degradation when signals are missing.

api/controllers/ (SessionController, ConsentController, RealtimeController, ReportController)
Unit test request validation and response/error mapping (400/500) with mocked orchestration layer.

Frontend packages (client/src)
pages/
Unit test page-level logic (button actions, navigation triggers) with mocked services.

components/
Unit test UI components rendering and props/state behavior.

lib/ (realtimeClient) & services/
Unit test API client request/response mapping, WebRTC connection handling, and error handling with mocked network layer.

lib/ & app/ (state)
Unit test state transitions (setup → started → turn submitted → report ready).

4.2 Integration Testing
Goal: Verify that different system components interact correctly and that data flows properly across system boundaries.
Integration testing validates:
API request lifecycle (routes → controllers → orchestration)

interaction between orchestration logic, guardrails, and AI services

Audio input → STT → guardrail evaluation → LLM question generation → TTS (Realtime API) output

feedback generation pipeline using session data and analysis outputs (Python API)

frontend–backend communication and UI updates

These tests ensure correct collaboration between system components.

Backend integrations
api/routes + api/controllers + orchestration/BackendOrchestrator
Validate endpoint-to-service wiring, request lifecycle, and correct status codes/payloads.

orchestration/BackendOrchestrator + orchestration/GuardrailsEngine + services/realtime
Validate STT → guardrail evaluation → LLM/TTS decision pipeline using mocked OpenAI realtime provider.

orchestration/BackendOrchestrator + services/analysis + persistence/storage/FileReportArchive
Validate end-of-session report generation using real session data + synthetic signals via PythonAnalysisClient.

Frontend integrations
pages/ + lib/realtimeClient + app/
Validate “record/submit/receive output” loop behavior with mocked backend/OpenAI responses.

pages/ + components/
Validate correct UI updates when transcript/intervention/next question is received.

4.3 System Testing
Goal: Validate the complete system as a black-box application and ensure that the entire interview workflow functions correctly from the user’s perspective.
System tests verify the full workflow:
Setup → Consent → Interview Session → Question/Answer Loop
→ Guardrail interventions → End Session → Feedback Report
Special focus areas include:
interview mode behavior (Neutral vs Supportive)

voice interaction using STT and TTS (OpenAI Realtime API)

correct UI navigation between setup, interview, and feedback screens

microphone & camera permission enforcement

behavioral analysis (Audio & Vision signal processing) inclusion when camera access is granted

If camera access is denied or behavioral analysis fails, the system must gracefully degrade and still produce a valid feedback report.
Packages involved: all frontend (pages, components, lib, app) and all backend (api, orchestration, services, domain, persistence).

4.4 Performance Testing
Goal: Validate responsiveness and stability for live usage.
Performance focus by package:
services/realtime & services/ai: latency and reliability of AI calls (OpenAI WebSocket timeouts, rate limits) and fallback behavior.

orchestration/BackendOrchestrator: end-to-end turn latency (input received → output decided).

services/analysis (PythonAPI & Node.js client): report generation time after session end (audio processing & Llama3.1 analysis).

api/routes & api/controllers: endpoint throughput and concurrency behavior under load.

Metrics: turn latency (p95/p99), report generation time, error rate, retry counts, concurrent session handling.

4.5 User Testing 
Goal: Validate usability and perceived value of the system with real users.
User test targets by package:
Frontend pages/components: clarity of guided flow, consent UX, interview screen usability, VoiceWaveCanvas responsiveness, feedback screen readability.

Backend orchestration + services/analysis: perceived coherence of interview flow and usefulness/actionability of the offline AI coach feedback.

Privacy expectation checks: consent handling and no credential exposure (system behavior verification).

Outputs: scenario-based sessions (Neutral and Supportive), user survey + qualitative feedback, usability issues mapped to NFR/PSR.
