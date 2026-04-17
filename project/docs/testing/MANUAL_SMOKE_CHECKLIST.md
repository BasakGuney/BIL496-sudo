# Manual Smoke Checklist

Owner: project team  
Evidence: screen recording, timestamped notes, exported report JSON/TXT when applicable

## Realtime interview loop

| Test ID | Scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| UTC-08 | Start a live session and let the interviewer speak back over WebRTC | Audio streams without transport or playback errors | Screen recording + browser console snapshot |
| ITC-02 | Start a session with a realistic config | First question matches selected context/difficulty and interviewer audio starts | Screen recording + sessionId |
| ITC-03 | Answer one question verbally in Neutral mode | STT -> guardrail evaluation -> next interviewer response completes end to end | Screen recording + backend logs |

## End-to-end workflow

| Test ID | Scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| STC-01 | Complete a normal Neutral interview | Setup -> Preview -> Interview -> Feedback completes within target duration | Screen recording + report export |
| STC-02 | Complete a Supportive interview with off-topic and uncertainty answers | Redirects and supportive assistance appear while flow stays coherent | Screen recording + transcript excerpt |

## Performance and usability

| Test ID | Scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| PTC-01 | Measure stop-speaking to system-response latency over multiple turns | p95 latency stays within target | Timing sheet or captured logs |
| PTC-02 | End a session and time report availability | Final report becomes available within target window | Timestamped notes |
| PTC-04 | Run a representative session and review backend usage counters | AI calls remain within expected caps per turn/session | Usage logs or report cost section |
| UAT-01 | New user performs setup without guidance | User reaches interview quickly with low confusion | Observation notes + short survey |
| UAT-02 | User reviews final report tone | Feedback remains constructive and psychologically safe | Observation notes + report excerpt |

## Execution notes

- Capture absolute date/time and tester name for every run.
- Record browser, OS, microphone, and camera model when a failure is environmental.
- Attach the `sessionId` to every manual evidence item so backend artefacts can be matched later.
