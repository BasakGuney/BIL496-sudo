export type Mode = "Supportive" | "Neutral";

type InterviewType = "HR" | "Technical";
type CandidateGender = "Kadın" | "Erkek";

export type TranscriptEntry = {
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

export type InterviewerAudioClip = {
  id: string;
  blob: Blob;
  mimeType: string;
  startedAt: number;
  endedAt: number;
  text?: string;
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  text?: string;
  delta?: string;
  response_id?: string;
  item_id?: string;
  item?: {
    id?: string;
    content?: Array<{ transcript?: string }>;
    formatted?: { transcript?: string };
  } | null;
  response?: {
    output?: Array<{
      content?: Array<{ transcript?: string; text?: string }>;
    }>;
    usage?: Record<string, unknown>;
    id?: string;
  } | null;
};

export type RealtimeConnection = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  remoteStream: MediaStream;
  analyser: AnalyserNode;
  audioEl: HTMLAudioElement;
  audioCtx: AudioContext;
  getTranscript: () => TranscriptEntry[];
  getCandidateAnswerAudios: (stopActive?: boolean) => Promise<CandidateAnswerAudio[]>;
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
    for (const content of contents) {
      if (typeof content?.transcript === "string" && content.transcript.trim()) chunks.push(content.transcript.trim());
      else if (typeof content?.text === "string" && content.text.trim()) chunks.push(content.text.trim());
    }
  }

  return chunks.join(" ").trim();
}

function normalizeCandidateTranscriptText(raw: string): string {
  const clean = String(raw || "").trim();
  if (!clean) return "";

  const arabicHelloVariants = new Set(["مرحبا", "مرحباً"]);
  if (arabicHelloVariants.has(clean)) return "Merhaba";

  return clean;
}

function extractStableTranscriptMessage(
  msg: RealtimeEvent
): { role: "interviewer" | "candidate"; text: string; source: TranscriptSource; model: string } | null {
  const candidateContentText = Array.isArray(msg?.item?.content)
    ? msg.item.content
      .map((content) => content?.transcript || "")
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
  difficulty?: string;
  onTranscriptUpdate?: (transcript: TranscriptEntry[]) => void;
  onInterviewerFinished?: (text: string) => void;
  onInterviewerAudio?: (clip: InterviewerAudioClip) => void;
}): Promise<RealtimeConnection> {
  const transcript: TranscriptEntry[] = [];
  const candidateAnswerAudios: CandidateAnswerAudio[] = [];
  const pendingAudioConversions: Promise<void>[] = [];
  const usageResponseIds = new Set<string>();

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onconnectionstatechange = () => console.log("[RTC] connectionState:", pc.connectionState);
  pc.oniceconnectionstatechange = () => console.log("[RTC] iceConnectionState:", pc.iceConnectionState);
  pc.onicecandidateerror = () => {};

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
  let interviewerAudioRecorder: MediaRecorder | null = null;
  let interviewerAudioChunks: Blob[] = [];
  let interviewerAudioStartedAt = 0;
  let currentInterviewerTurnStartedAt = 0;
  const completedCandidateTranscriptTurns: Array<{ startedAt: number; endedAt: number }> = [];
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
    if (opts.onTranscriptUpdate) {
      opts.onTranscriptUpdate([...transcript]);
    }
  };

  const buildMediaRecorder = (segmentQuestionIndex: number, segmentStartedAt: number) => {
    const recorder = new MediaRecorder(micStream);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        segmentChunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      if (segmentChunks.length) {
        const blob = new Blob(segmentChunks, { type: recorder.mimeType || "audio/webm" });
        const questionIndex = Math.max(1, segmentQuestionIndex || interviewerTurnCount || 1);
        const startedAt = segmentStartedAt || Date.now();
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
    mediaRecorder = buildMediaRecorder(activeQuestionIndex, activeSegmentStartedAt);
    try {
      mediaRecorder.start(250);
    } catch (error) {
      void error;
      isCandidateSegmentActive = false;
    }
  };

  const stopCandidateSegment = () => {
    if (!isCandidateSegmentActive) return;

    const segmentStartedAt = activeSegmentStartedAt || Date.now();
    const segmentEndedAt = Date.now();
    completedCandidateTranscriptTurns.push({ startedAt: segmentStartedAt, endedAt: segmentEndedAt });

    isCandidateSegmentActive = false;
    const recorder = mediaRecorder;
    mediaRecorder = null;
    activeSegmentStartedAt = 0;
    if (recorder && recorder.state !== "inactive") {
      activeSegmentStopPromise = new Promise((resolve) => {
        resolveActiveSegmentStopPromise = resolve;
      });
      try {
        recorder.requestData();
        recorder.stop();
      } catch (error) {
        void error;
        if (resolveActiveSegmentStopPromise) {
          resolveActiveSegmentStopPromise();
          resolveActiveSegmentStopPromise = null;
        }
      }
    }
  };

  const startInterviewerAudioCapture = () => {
    if (interviewerAudioRecorder || remoteStream.getAudioTracks().length === 0) return;

    interviewerAudioChunks = [];
    interviewerAudioStartedAt = Date.now();

    try {
      const recorder = new MediaRecorder(remoteStream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          interviewerAudioChunks.push(event.data);
        }
      };
      interviewerAudioRecorder = recorder;
      recorder.start(200);
    } catch (error) {
      console.debug("[RTC] interviewer audio capture unavailable", error);
      interviewerAudioRecorder = null;
      interviewerAudioChunks = [];
    }
  };

  const stopInterviewerAudioCapture = (text?: string) => {
    const recorder = interviewerAudioRecorder;
    interviewerAudioRecorder = null;
    if (!recorder || recorder.state === "inactive") return;

    recorder.onstop = () => {
      if (!interviewerAudioChunks.length) return;

      const blob = new Blob(interviewerAudioChunks, { type: recorder.mimeType || "audio/webm" });
      const clip: InterviewerAudioClip = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        blob,
        mimeType: recorder.mimeType || "audio/webm",
        startedAt: interviewerAudioStartedAt || Date.now(),
        endedAt: Date.now(),
        text,
      };

      interviewerAudioChunks = [];
      interviewerAudioStartedAt = 0;
      opts.onInterviewerAudio?.(clip);
    };

    try {
      recorder.requestData();
      window.setTimeout(() => {
        try {
          recorder.stop();
        } catch (error) {
          console.debug("[RTC] interviewer recorder stop skipped", error);
        }
      }, 80);
    } catch (error) {
      console.debug("[RTC] interviewer recorder requestData failed", error);
      interviewerAudioChunks = [];
      interviewerAudioStartedAt = 0;
    }
  };

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
    difficulty: String(opts.difficulty || ""),
  });

  const sdpResp = await fetch(`${opts.backendBaseUrl}/session?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: localSdp,
  });

  if (!sdpResp.ok) {
    const text = await sdpResp.text();
    throw new Error(`Backend /session failed: ${text}`);
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
  (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
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
          input_audio_transcription: {
            model,
            language: "tr",
            prompt: "Varsayılan dil TÜRKÇE olmalı ve Latin alfabesi kullanılmalı. Türkçe konuşmayı yazarken teknik İngilizce terimleri (ör: Jenkins, Kubernetes, Docker, GitHub, CI/CD) orijinal yazımıyla koru.",
          },
          audio: {
            input: {
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

  const postUsage = async (usage: Record<string, unknown>, responseId?: string) => {
    if (!usage) return;
    if (responseId) {
      if (usageResponseIds.has(responseId)) return;
      usageResponseIds.add(responseId);
    }
    try {
      await fetch(`${opts.backendBaseUrl}/session/${encodeURIComponent(opts.sessionId)}/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "realtimeApi", usage }),
      });
    } catch (error) {
      console.debug("[RTC] usage upload failed", error);
    }
  };

  dc.onmessage = (e) => {
    let msg: RealtimeEvent;
    try {
      msg = JSON.parse(e.data);
    } catch {
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
      currentInterviewerTurnStartedAt = Date.now();
      startInterviewerAudioCapture();
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
      const fullTextText = extractInterviewerFromResponseDone(msg);
      stopInterviewerAudioCapture(fullTextText);
      if (fullTextText && opts.onInterviewerFinished) {
        opts.onInterviewerFinished(fullTextText);
      }
    }

    if (msg?.response?.usage) {
      const responseId = msg?.response?.id || msg?.response_id || msg?.item_id;
      postUsage(msg.response.usage, responseId);
    }

    const isSpeechStarted = msg?.type === "input_audio_buffer.speech_started";
    const isSpeechStopped = msg?.type === "input_audio_buffer.speech_stopped";

    if (isSpeechStarted) {
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

    const transcriptTs = entry.role === "candidate"
      ? (completedCandidateTranscriptTurns.shift()?.endedAt || Date.now())
      : (currentInterviewerTurnStartedAt || Date.now());

    pushTranscriptDeduped(entry.role, entry.text, transcriptTs, entry.source, entry.model);
  };

  dc.onopen = () => {
    sendTranscriptionSessionUpdate(CANDIDATE_TRANSCRIPTION_MODEL);
    window.setTimeout(() => {
      requestInitialInterviewerResponse();
    }, 1200);
  };

  const close = () => {
    stopCandidateSegment();
    stopInterviewerAudioCapture();
    safeCleanup(() => micStream.getTracks().forEach((track) => track.stop()));
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
    getCandidateAnswerAudios: async (stopActive: boolean = false) => {
      if (stopActive && isCandidateSegmentActive) {
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
