export type Mode = "Supportive" | "Neutral";

type InterviewType = "HR" | "Technical";
type CandidateGender = "Kadın" | "Erkek";

type TranscriptEntry = {
  role: "interviewer" | "candidate";
  text: string;
  ts: number;
  source?: string;
  model?: string;
};
export type CandidateAnswerAudio = {
  questionIndex: number;
  mimeType: string;
  startedAt: number;
  endedAt: number;
  audioBase64: string;
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  text?: string;
  delta?: string;
  response_id?: string;
  item_id?: string;
  item?: any;
  response?: any;
  name?: string;
  arguments?: string;
  call_id?: string;
};

export type RealtimeConnection = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  remoteStream: MediaStream;
  analyser: AnalyserNode;
  audioEl: HTMLAudioElement;
  audioCtx: AudioContext;
  getTranscript: () => TranscriptEntry[];
  getCandidateAnswerAudios: () => Promise<CandidateAnswerAudio[]>;
  close: () => void;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const parts = result.split(",");
      resolve(parts[1] || "");
    };
    reader.onerror = () => reject(reader.error || new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}

function safeCleanup(fn: () => void) {
  try {
    fn();
  } catch (error) {
    console.debug("[RTC] cleanup skipped", error);
  }
}

const CANDIDATE_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const INTERVIEWER_TRANSCRIPT_MODEL = "gpt-4o-realtime";

type TranscriptSource =
  | "openai-realtime-input_audio_transcription"
  | "openai-realtime-response_audio_transcript"
  | "openai-realtime-response_output_text_fallback"
  | "openai-realtime-response_done_fallback";


function extractInterviewerFromResponseDone(msg: RealtimeEvent): string {
  const outputs = Array.isArray(msg?.response?.output) ? msg.response.output : [];
  const chunks: string[] = [];

  for (const out of outputs) {
    const contents = Array.isArray(out?.content) ? out.content : [];
    for (const c of contents) {
      if (typeof c?.transcript === "string" && c.transcript.trim()) chunks.push(c.transcript.trim());
      else if (typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
    }
  }

  return chunks.join(" ").trim();
}

function normalizeCandidateTranscriptText(raw: string): string {
  const clean = String(raw || "").trim();
  if (!clean) return "";

  // Force default display language to Turkish (Latin script) for common accidental Arabic-script greeting outputs.
  const arabicHelloVariants = new Set(["مرحبا", "مرحباً"]);
  if (arabicHelloVariants.has(clean)) return "Merhaba";

  return clean;
}

function extractStableTranscriptMessage(
  msg: RealtimeEvent
): { role: "interviewer" | "candidate"; text: string; source: TranscriptSource; model: string } | null {
  const candidateContentText = Array.isArray(msg?.item?.content)
    ? msg.item.content
      .map((c: any) => c?.transcript || "")
      .filter(Boolean)
      .join(" ")
    : "";

  const candidateText =
    msg?.item?.formatted?.transcript ||
    candidateContentText ||
    (typeof msg?.transcript === "string" ? msg.transcript : "");

  if (msg?.type === "conversation.item.input_audio_transcription.completed" && candidateText.trim()) {
    return {
      role: "candidate",
      text: normalizeCandidateTranscriptText(candidateText),
      source: "openai-realtime-input_audio_transcription",
      model: CANDIDATE_TRANSCRIPTION_MODEL,
    };
  }

  if (msg?.type === "response.audio_transcript.done" && typeof msg?.transcript === "string" && msg.transcript.trim()) {
    return {
      role: "interviewer",
      text: msg.transcript,
      source: "openai-realtime-response_audio_transcript",
      model: INTERVIEWER_TRANSCRIPT_MODEL,
    };
  }

  if (msg?.type === "response.output_text.done" && typeof msg?.text === "string" && msg.text.trim()) {
    return {
      role: "interviewer",
      text: msg.text,
      source: "openai-realtime-response_output_text_fallback",
      model: INTERVIEWER_TRANSCRIPT_MODEL,
    };
  }

  if (msg?.type === "response.done") {
    const text = extractInterviewerFromResponseDone(msg);
    if (text) {
      return {
        role: "interviewer",
        text,
        source: "openai-realtime-response_done_fallback",
        model: INTERVIEWER_TRANSCRIPT_MODEL,
      };
    }
  }

  return null;
}

function pushTranscript(
  transcript: TranscriptEntry[],
  role: "interviewer" | "candidate",
  text: string,
  ts: number = Date.now(),
  source?: string,
  model?: string
) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const last = transcript[transcript.length - 1];
  if (last && last.role === role && ts - last.ts < 1800) {
    last.text = `${last.text} ${clean}`.trim();
    last.ts = ts;
    return;
  }

  transcript.push({ role, text: clean, ts, source, model });
}

function normalizeTranscriptFingerprint(role: "interviewer" | "candidate", text: string) {
  return `${role}:${String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/\s+/g, " ")
    .trim()}`;
}


async function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }, 1500);

    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", onState);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onState);
  });
}

export async function connectRealtimeInterview(opts: {
  backendBaseUrl: string;
  sessionId: string;
  mode: Mode;
  interviewType: InterviewType;
  firstName: string;
  lastName: string;
  gender: CandidateGender;
  role: string;
  companyOrIndustry: string;
  domainInterest: string;
}): Promise<RealtimeConnection> {
  const transcript: TranscriptEntry[] = [];
  const candidateAnswerAudios: CandidateAnswerAudio[] = [];
  const pendingAudioConversions: Promise<void>[] = [];

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onconnectionstatechange = () => console.log("[RTC] connectionState:", pc.connectionState);
  pc.oniceconnectionstatechange = () => console.log("[RTC] iceConnectionState:", pc.iceConnectionState);
  pc.onicecandidateerror = () => { /* ignored to avoid console spam */ };

  pc.addTransceiver("audio", { direction: "recvonly" });

  const dc = pc.createDataChannel("oai-events");
  dc.onerror = (e) => console.log("[RTC] datachannel error:", e);
  let initialResponseRequested = false;

  const requestInitialInterviewerResponse = () => {
    if (initialResponseRequested || dc.readyState !== "open") return;
    initialResponseRequested = true;
    dc.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
        },
      })
    );
  };

  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    remoteStream.addTrack(e.track);
  };

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(micStream.getTracks()[0], micStream);

  let interviewerTurnCount = 0;
  let isCandidateSegmentActive = false;
  let activeQuestionIndex = 1;
  let activeSegmentStartedAt = 0;
  let mediaRecorder: MediaRecorder | null = null;
  let segmentChunks: Blob[] = [];
  let activeSegmentStopPromise: Promise<void> | null = null;
  let resolveActiveSegmentStopPromise: (() => void) | null = null;
  let interviewerSpeaking = false;
  const recentlyPushedFingerprints = new Map<string, number>();
  const interviewerResponseIdsWithTranscript = new Set<string>();

  const pushTranscriptDeduped = (
    role: "interviewer" | "candidate",
    text: string,
    ts: number = Date.now(),
    source?: string,
    model?: string
  ) => {
    const clean = String(text || "").trim();
    if (!clean) return;

    const key = normalizeTranscriptFingerprint(role, clean);
    const lastSeenAt = recentlyPushedFingerprints.get(key);
    // Some realtime schemas emit the same final transcript from multiple event families.
    // Ignore very recent duplicates while still allowing the same phrase later in the interview.
    if (typeof lastSeenAt === "number" && ts - lastSeenAt < 4000) {
      return;
    }

    recentlyPushedFingerprints.set(key, ts);
    if (recentlyPushedFingerprints.size > 80) {
      const threshold = ts - 15000;
      for (const [fingerprint, seenAt] of recentlyPushedFingerprints) {
        if (seenAt < threshold) {
          recentlyPushedFingerprints.delete(fingerprint);
        }
      }
    }

    pushTranscript(transcript, role, clean, ts, source, model);
  };

  const buildMediaRecorder = () => {
    const recorder = new MediaRecorder(micStream);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        segmentChunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      if (segmentChunks.length) {
        const blob = new Blob(segmentChunks, { type: recorder.mimeType || "audio/webm" });
        const questionIndex = Math.max(1, activeQuestionIndex || interviewerTurnCount || 1);
        const startedAt = activeSegmentStartedAt || Date.now();
        const endedAt = Date.now();
        segmentChunks = [];

        const conversion = blobToBase64(blob)
          .then((audioBase64) => {
            if (!audioBase64) return;
            candidateAnswerAudios.push({
              questionIndex,
              mimeType: recorder.mimeType || "audio/webm",
              startedAt,
              endedAt,
              audioBase64,
            });
          })
          .catch(() => undefined);
        pendingAudioConversions.push(conversion);
      }

      if (resolveActiveSegmentStopPromise) {
        resolveActiveSegmentStopPromise();
        resolveActiveSegmentStopPromise = null;
      }
    };
    return recorder;
  };

  const startCandidateSegment = () => {
    if (isCandidateSegmentActive) return;

    isCandidateSegmentActive = true;
    activeQuestionIndex = Math.max(1, interviewerTurnCount || 1);
    activeSegmentStartedAt = Date.now();
    segmentChunks = [];
    mediaRecorder = buildMediaRecorder();
    try {
      mediaRecorder.start(250);
    } catch (_error) {
      isCandidateSegmentActive = false;
    }
  };

  const stopCandidateSegment = () => {
    if (!isCandidateSegmentActive) return;
    isCandidateSegmentActive = false;
    const recorder = mediaRecorder;
    mediaRecorder = null;
    if (recorder && recorder.state !== "inactive") {
      activeSegmentStopPromise = new Promise((resolve) => {
        resolveActiveSegmentStopPromise = resolve;
      });
      try {
        recorder.requestData();
        recorder.stop();
      } catch (_error) {
        if (resolveActiveSegmentStopPromise) {
          resolveActiveSegmentStopPromise();
          resolveActiveSegmentStopPromise = null;
        }
        // ignored
      }
    }
  };

  // Browser SpeechRecognition is intentionally disabled.
  // Candidate transcript is sourced from OpenAI Realtime input_audio_transcription events
  // so both interviewer + candidate text come from the same backend model pipeline.

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  const localSdp = pc.localDescription?.sdp || "";
  const query = new URLSearchParams({
    mode: opts.mode,
    sessionId: opts.sessionId,
    interviewType: opts.interviewType,
    firstName: opts.firstName,
    lastName: opts.lastName,
    gender: opts.gender,
    role: opts.role,
    domain: opts.domainInterest,
    companyOrIndustry: opts.companyOrIndustry,
  });

  const sdpResp = await fetch(`${opts.backendBaseUrl}/session?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: localSdp,
  });

  if (!sdpResp.ok) {
    const t = await sdpResp.text();
    throw new Error(`Backend /session failed: ${t}`);
  }

  const answerSdp = await sdpResp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  const existing = document.getElementById("realtime-remote-audio") as HTMLAudioElement | null;
  if (existing) {
    safeCleanup(() => existing.pause());
    safeCleanup(() => {
      existing.srcObject = null;
      existing.remove();
    });
  }

  const audioEl = document.createElement("audio");
  audioEl.id = "realtime-remote-audio";
  audioEl.autoplay = true;
  (audioEl as any).playsInline = true;
  audioEl.style.display = "none";
  audioEl.srcObject = remoteStream;
  document.body.appendChild(audioEl);

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(remoteStream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const sendTranscriptionSessionUpdate = (model: string) => {
    if (dc.readyState !== "open") return;
    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
          // Preferred field for newer realtime schemas.
          input_audio_transcription: {
            model,
            language: "tr",
            prompt: "Varsayılan dil TÜRKÇE olmalı ve Latin alfabesi kullanılmalı. Türkçe konuşmayı yazarken teknik İngilizce terimleri (ör: Jenkins, Kubernetes, Docker, GitHub, CI/CD) orijinal yazımıyla koru.",
          },
          audio: {
            input: {
              // Compatibility field for older schema variants.
              transcription: {
                model,
                language: "tr",
                prompt: "Varsayılan dil Türkçe (Latin alfabesi) olsun. Türkçe konuşmada geçen teknik İngilizce terimleri doğru yaz.",
              },
              turn_detection: {
                type: "server_vad",
                create_response: true,
                prefix_padding_ms: 300,
                silence_duration_ms: 700,
              },
            },
          },
        },
      })
    );
  };

  dc.onmessage = (e) => {
    let msg: RealtimeEvent;
    try {
      msg = JSON.parse(e.data);
    } catch (error) {
      return;
    }

    if (msg?.type === "session.created" || msg?.type === "session.updated") {
      requestInitialInterviewerResponse();
    }

    const isInterviewerDelta =
      msg?.type === "response.output_text.delta" ||
      msg?.type === "response.audio_transcript.delta";
    const isInterviewerDone = msg?.type === "response.done";
    const isInterviewerAudioDone =
      msg?.type === "response.audio.done" ||
      msg?.type === "response.audio_transcript.done" ||
      msg?.type === "response.output_text.done";

    if (isInterviewerDelta && !interviewerSpeaking) {
      interviewerSpeaking = true;
      if (isCandidateSegmentActive) {
        stopCandidateSegment();
      }
    }

    if (isInterviewerAudioDone) {
      interviewerSpeaking = false;
    }

    if (isInterviewerDone) {
      interviewerSpeaking = false;
      interviewerTurnCount += 1;
    }

    const isSpeechStarted = msg?.type === "input_audio_buffer.speech_started";
    const isSpeechStopped = msg?.type === "input_audio_buffer.speech_stopped";

    if (isSpeechStarted) {
      // Candidate speech-start is the most reliable boundary for answer recording.
      // Reset interviewer speaking flag here to avoid late segment starts.
      interviewerSpeaking = false;
      startCandidateSegment();
    }

    if (isSpeechStopped) {
      stopCandidateSegment();
    }

    const entry = extractStableTranscriptMessage(msg);
    if (!entry?.text?.trim()) return;

    const messageResponseId =
      msg?.response_id ||
      msg?.response?.id ||
      msg?.item?.id ||
      msg?.item_id ||
      `${msg.type}-${entry.role}`;

    if (entry.source === "openai-realtime-response_audio_transcript") {
      interviewerResponseIdsWithTranscript.add(messageResponseId);
    }

    if (
      entry.source === "openai-realtime-response_output_text_fallback" ||
      entry.source === "openai-realtime-response_done_fallback"
    ) {
      if (interviewerResponseIdsWithTranscript.has(messageResponseId)) return;
      interviewerResponseIdsWithTranscript.add(messageResponseId);
    }

    pushTranscriptDeduped(entry.role, entry.text, Date.now(), entry.source, entry.model);

  };

  dc.onopen = () => {
    // First try with mini-transcribe.
    sendTranscriptionSessionUpdate(CANDIDATE_TRANSCRIPTION_MODEL);

    // Interviewer instructions are managed on the server via PromptTemplates.
    // Client only updates transcription/turn-detection settings here.
    // Trigger first interviewer turn after session ack; keep timeout fallback.
    window.setTimeout(() => {
      requestInitialInterviewerResponse();
    }, 1200);
  };

  const close = () => {
    stopCandidateSegment();
    safeCleanup(() => micStream.getTracks().forEach((t) => t.stop()));
    safeCleanup(() => pc.close());
    safeCleanup(() => audioCtx.close());
    safeCleanup(() => audioEl.pause());
    safeCleanup(() => {
      audioEl.srcObject = null;
      audioEl.remove();
    });
  };

  return {
    pc,
    dc,
    remoteStream,
    analyser,
    audioEl,
    audioCtx,
    getTranscript: () => [...transcript],
    getCandidateAnswerAudios: async () => {
      if (isCandidateSegmentActive) {
        stopCandidateSegment();
      }
      if (activeSegmentStopPromise) {
        await activeSegmentStopPromise;
        activeSegmentStopPromise = null;
      }

      await Promise.allSettled(pendingAudioConversions);
      return [...candidateAnswerAudios];
    },
    close,
  };
}
