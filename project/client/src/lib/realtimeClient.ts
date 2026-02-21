import type { Mode, SessionConfig } from "./types";

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

function getHonorific(gender: SessionConfig["gender"]) {
  if (gender === "Female") return "Hanım";
  if (gender === "Male") return "Bey";
  return "";
}

function buildInterviewRules(config: SessionConfig) {
  const honorific = getHonorific(config.gender);
  const candidateAddress = `${config.firstName}${honorific ? ` ${honorific}` : ""}`.trim();

  return {
    interview_flow: {
      opening: {
        greeting: true,
        askHowAreYou: true,
        interviewerReplyIfUserAsks: "Ben de iyiyim sağ olun.",
        briefing: {
          mentionInterviewType: config.interviewType,
          mentionEstimatedDurationMin: config.interviewType === "HR" ? 12 : 15,
          remindCameraAndMicCheck: true,
        },
      },
      question_loop: {
        startPhrase: "Hazırsanız başlayalım.",
        mandatoryFirstQuestion: "Kısaca kendinizden, eğitim hayatınızdan ve iş tecrübelerinizden bahseder misiniz?",
        questionCountRange: "5-6",
        hrMode: {
          avoidMentioningSTARByName: true,
          adaptToPreviousAnswer: true,
          requireContextualFollowUpsFromCandidateAnswer: true,
        },
        technicalMode: {
          useSetupContext: {
            role: config.role,
            domainInterest: config.domainInterest,
            companyOrIndustry: config.companyOrIndustry,
          },
          canBeLooselyConnected: true,
        },
        perQuestionTimeLimitSec: config.interviewType === "HR" ? 120 : 150,
        overTimeInterruptionText: "Anladım, bu kadarı yeterli. İsterseniz devam edelim.",
      },
      supportive_mode_rules: {
        enabled: config.mode === "Supportive",
        whenCandidateStuck: {
          cues: ["bilmiyorum", "ııı", "eee", "aaa"],
          action: ["give_hint", "offer_reframe", "switch_question_if_needed"],
        },
        voice_style: "cheerful_positive_relaxing",
      },
      memory_rules: {
        rememberAllPreviousAnswers: true,
        useAnswerHistoryForFollowUps: true,
      },
      answer_relevance_scoring: {
        evaluateSilently: true,
        storeInBackend: true,
      },
      closing: {
        closingSpeech: "Tanıştığımıza memnun oldum. Değerlendirmeler yapılıp belirlenen süre içinde size geri dönüş yapılacaktır.",
        waitForCandidateGoodbye: true,
      },
      candidate_address: candidateAddress,
    },
  };
}

export async function connectRealtimeInterview(opts: {
  backendBaseUrl: string;
  mode: Mode;
  sessionId: string;
  config: SessionConfig;
}): Promise<RealtimeConnection> {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.addTransceiver("audio", { direction: "recvonly" });

  const dc = pc.createDataChannel("oai-events");
  const remoteStream = new MediaStream();
  pc.ontrack = (e) => remoteStream.addTrack(e.track);

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(micStream.getTracks()[0], micStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  const localSdp = pc.localDescription?.sdp || "";
  const sdpResp = await fetch(`${opts.backendBaseUrl}/sessions/${encodeURIComponent(opts.sessionId)}/realtime/offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerSdp: localSdp }),
  });

  if (!sdpResp.ok) {
    throw new Error(`Backend realtime offer failed: ${await sdpResp.text()}`);
  }

  const payload = await sdpResp.json();
  await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });

  const existing = document.getElementById("realtime-remote-audio") as HTMLAudioElement | null;
  if (existing) {
    try { existing.pause(); existing.srcObject = null; existing.remove(); } catch {}
  }

  const audioEl = document.createElement("audio");
  audioEl.id = "realtime-remote-audio";
  audioEl.autoplay = true;
  audioEl.style.display = "none";
  audioEl.srcObject = remoteStream;
  document.body.appendChild(audioEl);

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(remoteStream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  dc.onopen = () => {
    const rules = buildInterviewRules(opts.config);

    dc.send(JSON.stringify({ type: "session.update", session: { ...rules, mode: opts.mode } }));
    dc.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: "Follow interview_flow rules from session.update exactly. Ask direct interview questions without mentioning STAR by name, and generate follow-up questions from candidate's previous answers.",
        },
      })
    );
  };

  const close = () => {
    try { micStream.getTracks().forEach((t) => t.stop()); } catch {}
    try { pc.close(); } catch {}
    try { audioCtx.close(); } catch {}
    try { audioEl.pause(); audioEl.srcObject = null; audioEl.remove(); } catch {}
  };

  return { pc, dc, remoteStream, analyser, audioEl, audioCtx, close };
}
