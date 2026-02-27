export type Mode = "Supportive" | "Neutral";

type InterviewType = "HR" | "Technical";
type CandidateGender = "Kadın" | "Erkek";

type TranscriptEntry = { role: "interviewer" | "candidate"; text: string; ts: number };

export type RealtimeConnection = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  remoteStream: MediaStream;
  analyser: AnalyserNode;
  audioEl: HTMLAudioElement;
  audioCtx: AudioContext;
  getTranscript: () => TranscriptEntry[];
  close: () => void;
};

function safeCleanup(fn: () => void) {
  try {
    fn();
  } catch (error) {
    console.debug("[RTC] cleanup skipped", error);
  }
}

function normalizeRole(role: string) {
  if (role === "assistant") return "interviewer" as const;
  if (role === "user") return "candidate" as const;
  return null;
}

function readContentText(content: any[] | undefined): string {
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    if (typeof part?.transcript === "string") parts.push(part.transcript);
    else if (typeof part?.text === "string") parts.push(part.text);
    else if (typeof part === "string") parts.push(part);
  }

  return parts.join(" ").trim();
}

function extractTextMessage(msg: any): { role: "interviewer" | "candidate"; text: string } | null {
  const candidateText = msg?.transcript || msg?.text;
  if (msg?.type === "conversation.item.input_audio_transcription.completed" && typeof candidateText === "string") {
    return { role: "candidate", text: candidateText };
  }

  if (msg?.type === "response.audio_transcript.done" && typeof msg?.transcript === "string") {
    return { role: "interviewer", text: msg.transcript };
  }

  if (msg?.type === "response.output_text.done" && typeof msg?.text === "string") {
    return { role: "interviewer", text: msg.text };
  }

  if (msg?.type === "conversation.item.created") {
    const role = normalizeRole(msg?.item?.role);
    const text = readContentText(msg?.item?.content);
    if (role && text) return { role, text };
  }

  if (msg?.type === "response.output_item.done") {
    const role = normalizeRole(msg?.item?.role);
    const text = readContentText(msg?.item?.content);
    if (role && text) return { role, text };
  }

  return null;
}

async function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const onState = () => {
      if (pc.iceGatheringState === "complete") {
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

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onconnectionstatechange = () => console.log("[RTC] connectionState:", pc.connectionState);
  pc.oniceconnectionstatechange = () => console.log("[RTC] iceConnectionState:", pc.iceConnectionState);
  pc.onicecandidateerror = (e) => console.log("[RTC] icecandidateerror:", e);

  pc.addTransceiver("audio", { direction: "recvonly" });

  const dc = pc.createDataChannel("oai-events");
  dc.onerror = (e) => console.log("[RTC] datachannel error:", e);

  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    remoteStream.addTrack(e.track);
  };

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(micStream.getTracks()[0], micStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  const localSdp = pc.localDescription?.sdp || "";
  const params = new URLSearchParams({
    mode: opts.mode,
    sessionId: opts.sessionId,
    interviewType: opts.interviewType,
    firstName: opts.firstName,
    lastName: opts.lastName,
    gender: opts.gender,
    role: opts.role,
    companyOrIndustry: opts.companyOrIndustry,
    domainInterest: opts.domainInterest,
  });

  const sdpResp = await fetch(`${opts.backendBaseUrl}/session?${params.toString()}`, {
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
    let msg: any;
    try {
      msg = JSON.parse(e.data);
    } catch (_error) {
      return;
    }

    const entry = extractTextMessage(msg);
    if (entry?.text?.trim()) {
      transcript.push({ ...entry, text: entry.text.trim(), ts: Date.now() });
    }
  };

  dc.onopen = () => {
    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          audio: {
            input: {
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

    dc.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
        },
      })
    );
  };

  const close = () => {
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
    close,
  };
}
