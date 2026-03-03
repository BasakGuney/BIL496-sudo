export type Mode = "Supportive" | "Neutral";

type InterviewType = "HR" | "Technical";
type CandidateGender = "Kadın" | "Erkek";

type TranscriptEntry = { role: "interviewer" | "candidate"; text: string; ts: number };
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

function extractTextMessage(msg: RealtimeEvent): { role: "interviewer" | "candidate"; text: string } | null {
  const nestedCandidateText = Array.isArray(msg?.item?.content)
    ? msg.item.content
      .map((c: any) => c?.transcript || c?.text || "")
      .filter(Boolean)
      .join(" ")
    : "";

  const candidateText = msg?.transcript || msg?.text || nestedCandidateText;
  if (msg?.type === "conversation.item.input_audio_transcription.completed" && typeof candidateText === "string") {
    return { role: "candidate", text: candidateText };
  }

  if (msg?.type === "conversation.item.input_audio_transcription.delta" && typeof msg?.delta === "string") {
    return { role: "candidate", text: msg.delta };
  }

  if (msg?.type === "conversation.item.completed" && msg?.item?.role === "user" && candidateText) {
    return { role: "candidate", text: candidateText };
  }

  if (msg?.type === "response.audio_transcript.done" && typeof msg?.transcript === "string") {
    return { role: "interviewer", text: msg.transcript };
  }

  if (msg?.type === "response.output_text.done" && typeof msg?.text === "string") {
    return { role: "interviewer", text: msg.text };
  }

  if (msg?.type === "response.output_text.delta" && typeof msg?.delta === "string") {
    return { role: "interviewer", text: msg.delta };
  }

  if (msg?.type === "response.audio_transcript.delta" && typeof msg?.delta === "string") {
    return { role: "interviewer", text: msg.delta };
  }

  if (msg?.type === "response.done") {
    const merged = extractFromResponseDone(msg);
    if (merged) return merged;
  }

  if (msg?.type === "conversation.item.created" || msg?.type === "conversation.item.updated") {
    const conversationText = extractFromConversationItem(msg);
    if (conversationText) return conversationText;
  }

  return null;
}

function pushTranscript(
  transcript: TranscriptEntry[],
  role: "interviewer" | "candidate",
  text: string,
  ts: number = Date.now()
) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const last = transcript[transcript.length - 1];
  if (last && last.role === role && ts - last.ts < 1800) {
    last.text = `${last.text} ${clean}`.trim();
    last.ts = ts;
    return;
  }

  transcript.push({ role, text: clean, ts });
}


function extractFromConversationItem(msg: any): { role: "interviewer" | "candidate"; text: string } | null {
  const item = msg?.item;
  if (!item) return null;

  const role = item?.role === "assistant" ? "interviewer" : item?.role === "user" ? "candidate" : null;
  if (!role) return null;

  const contents = Array.isArray(item?.content) ? item.content : [];
  const chunks: string[] = [];
  for (const c of contents) {
    if (typeof c?.transcript === "string" && c.transcript.trim()) chunks.push(c.transcript.trim());
    else if (typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
  }

  if (chunks.length === 0) return null;
  return { role, text: chunks.join(" ") };
}

function extractFromResponseDone(msg: any): { role: "interviewer"; text: string } | null {
  const outputs = Array.isArray(msg?.response?.output) ? msg.response.output : [];
  const chunks: string[] = [];

  for (const out of outputs) {
    const contents = Array.isArray(out?.content) ? out.content : [];
    for (const c of contents) {
      if (typeof c?.transcript === "string" && c.transcript.trim()) chunks.push(c.transcript.trim());
      else if (typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
    }
  }

  if (chunks.length === 0) return null;
  return { role: "interviewer", text: chunks.join(" ") };
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
  const deltaBuffers = new Map<string, { role: "interviewer" | "candidate"; text: string; ts: number }>();

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
  let interviewerHasSpoken = false;

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

  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const localSpeechRecognition = SpeechRecognitionCtor ? new SpeechRecognitionCtor() : null;

  let recognitionStopped = false;
  if (localSpeechRecognition) {
    localSpeechRecognition.continuous = true;
    localSpeechRecognition.interimResults = false;
    localSpeechRecognition.maxAlternatives = 1;
    localSpeechRecognition.lang = "tr-TR";
    localSpeechRecognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal && result[0]?.transcript) {
          pushTranscript(transcript, "candidate", String(result[0].transcript), Date.now());
        }
      }
    };
    localSpeechRecognition.onerror = () => undefined;
    localSpeechRecognition.onend = () => {
      if (recognitionStopped) return;
      try {
        localSpeechRecognition.start();
      } catch (_error) {
        // ignored
      }
    };

    try {
      localSpeechRecognition.start();
    } catch (_error) {
      // ignored
    }
  }

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

    const isCandidateDelta = msg?.type === "conversation.item.input_audio_transcription.delta";
    const isCandidateDone = msg?.type === "conversation.item.input_audio_transcription.completed";
    const isInterviewerDelta =
      msg?.type === "response.output_text.delta" ||
      msg?.type === "response.audio_transcript.delta";
    const isInterviewerDone = msg?.type === "response.done";
    const isDelta = isInterviewerDelta || isCandidateDelta;
    const isDone = isInterviewerDone || isCandidateDone;

    if (isInterviewerDelta && !interviewerSpeaking) {
      interviewerSpeaking = true;
      if (isCandidateSegmentActive) {
        stopCandidateSegment();
      }
    }

    if (isInterviewerDone) {
      interviewerSpeaking = false;
      interviewerHasSpoken = true;
      interviewerTurnCount += 1;
    }

    const isSpeechStarted = msg?.type === "input_audio_buffer.speech_started";
    const isSpeechStopped = msg?.type === "input_audio_buffer.speech_stopped";

    if (isSpeechStarted) {
      startCandidateSegment();
    }

    if (isSpeechStopped) {
      stopCandidateSegment();
    }

    if (isDelta) {
      const id = msg.response_id || msg.item_id || `${msg.type}-fallback`;
      const extracted = extractTextMessage(msg);
      if (!extracted?.text) return;

      const prev = deltaBuffers.get(id);
      if (prev) {
        prev.text = `${prev.text}${extracted.text}`;
        prev.ts = Date.now();
      } else {
        deltaBuffers.set(id, { role: extracted.role, text: extracted.text, ts: Date.now() });
      }
      return;
    }

    if (isDone) {
      const id = msg.response_id || msg.item_id || `${msg.type}-fallback`;
      const buffered = deltaBuffers.get(id);
      if (buffered && buffered.text.trim()) {
        pushTranscript(transcript, buffered.role, buffered.text, buffered.ts);
      }
      deltaBuffers.delete(id);
    }

    const entry = extractTextMessage(msg);
    if (entry?.text?.trim()) {
      pushTranscript(transcript, entry.role, entry.text, Date.now());
      if (entry.role === "candidate" && !interviewerHasSpoken && !isCandidateSegmentActive) {
        startCandidateSegment();
      }
    }
  };

  dc.onopen = () => {
    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
          audio: {
            input: {
              input_audio_transcription: {
                model: "gpt-4o-mini-transcribe",
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

    // Interviewer instructions are managed on the server via PromptTemplates.
    // Client only updates transcription/turn-detection settings here.
    // Trigger first interviewer turn after session ack; keep timeout fallback.
    window.setTimeout(() => {
      requestInitialInterviewerResponse();
    }, 1200);
  };

  const close = () => {
    recognitionStopped = true;
    safeCleanup(() => localSpeechRecognition?.stop());
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

  const flushBufferedTranscript = () => {
    deltaBuffers.forEach((buffered) => {
      if (buffered?.text?.trim()) {
        pushTranscript(transcript, buffered.role, buffered.text, buffered.ts);
      }
    });
    deltaBuffers.clear();
  };

  return {
    pc,
    dc,
    remoteStream,
    analyser,
    audioEl,
    audioCtx,
    getTranscript: () => {
      flushBufferedTranscript();
      return [...transcript];
    },
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
