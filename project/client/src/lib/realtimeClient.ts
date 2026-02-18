export type Mode = "Supportive" | "Neutral";

export type RealtimeConnection = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  remoteStream: MediaStream;
  analyser: AnalyserNode;
  audioEl: HTMLAudioElement;
  audioCtx: AudioContext;
  close: () => void;
};

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
  mode: Mode;
}): Promise<RealtimeConnection> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onconnectionstatechange = () =>
    console.log("[RTC] connectionState:", pc.connectionState);
  pc.oniceconnectionstatechange = () =>
    console.log("[RTC] iceConnectionState:", pc.iceConnectionState);
  pc.onicecandidateerror = (e) => console.log("[RTC] icecandidateerror:", e);

  // Remote audio garanti
  pc.addTransceiver("audio", { direction: "recvonly" });

  const dc = pc.createDataChannel("oai-events");
  dc.onerror = (e) => console.log("[RTC] datachannel error:", e);

  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    console.log("[RTC] ontrack:", e.track.kind);
    remoteStream.addTrack(e.track);
  };

  // mic
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(micStream.getTracks()[0], micStream);

  // offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  const localSdp = pc.localDescription?.sdp || "";
  const sdpResp = await fetch(
    `${opts.backendBaseUrl}/session?mode=${encodeURIComponent(opts.mode)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: localSdp,
    }
  );

  if (!sdpResp.ok) {
    const t = await sdpResp.text();
    throw new Error(`Backend /session failed: ${t}`);
  }

  const answerSdp = await sdpResp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  // ✅ audio element tek olsun
  const existing = document.getElementById("realtime-remote-audio") as HTMLAudioElement | null;
  if (existing) {
    try {
      existing.pause();
      existing.srcObject = null;
      existing.remove();
    } catch {}
  }

  const audioEl = document.createElement("audio");
  audioEl.id = "realtime-remote-audio";
  audioEl.autoplay = true;
  audioEl.playsInline = true;
  audioEl.style.display = "none";
  audioEl.srcObject = remoteStream;
  document.body.appendChild(audioEl);

  // analyser
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(remoteStream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  // Event log
  dc.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (
        msg.type?.startsWith("input_audio_buffer.") ||
        msg.type?.startsWith("response.") ||
        msg.type?.startsWith("session.") ||
        msg.type === "error"
      ) {
        console.log("[Realtime event]", msg.type, msg);
      }
    } catch {}
  };

  // ✅ VAD + “HEMEN KONUŞ” (conversation.item.create yok, direkt response.create)
  dc.onopen = () => {
    console.log("[RTC] datachannel open → configuring + starting interview");

    // VAD (doğru path)
    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
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

    // ✅ İlk konuşmayı garanti: response.create + modalities + instructions
    dc.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "Şimdi Türkçe bir mülakat başlat. 1 cümle selamla, 1 cümle süreci söyle ve hemen ilk soruyu sor. " +
            "Mülakatçı gibi kısa ve net ol. Kullanıcının cevabını bekle.",
        },
      })
    );
  };

  const close = () => {
    try {
      micStream.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      pc.close();
    } catch {}
    try {
      audioCtx.close();
    } catch {}
    try {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
    } catch {}
  };

  return { pc, dc, remoteStream, analyser, audioEl, audioCtx, close };
}
