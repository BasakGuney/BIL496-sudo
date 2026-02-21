export type Mode = "Supportive" | "Neutral";

type InterviewType = "HR" | "Technical";
type CandidateGender = "Kadın" | "Erkek";

export type RealtimeConnection = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  remoteStream: MediaStream;
  analyser: AnalyserNode;
  audioEl: HTMLAudioElement;
  audioCtx: AudioContext;
  close: () => void;
};

function buildInterviewerPrompt(input: {
  mode: Mode;
  interviewType: InterviewType;
  firstName: string;
  lastName: string;
  gender: CandidateGender;
  role: string;
  companyOrIndustry: string;
  domainInterest: string;
}) {
  const title = input.gender === "Kadın" ? "Hanım" : "Bey";
  const styleInstruction =
    input.mode === "Supportive"
      ? "Supportive moddasın: daha neşeli, pozitif ve rahatlatıcı bir ton kullan. Aday takılırsa (örn. 'ııı', 'bilmiyorum') kısa ipucu ver veya nazikçe bir sonraki soruya geç."
      : "Neutral moddasın: resmi, dengeli ve tarafsız ilerle. Gereksiz ipucu verme.";

  const questionStrategy =
    input.interviewType === "HR"
      ? "Soru döngüsünde STAR yaklaşımına uygun toplam 5-6 soru sor. Her yeni soruyu adayın önceki cevaplarına göre şekillendir ve cevapları unutma."
      : "Soru döngüsünde toplam 5-6 teknik soru sor. Sorular adayın hedef rolü, ilgi alanı ve çalışmak istediği sektörle uyumlu olsun. Soruların birbirine çok sıkı bağlı olması zorunlu değil.";

  return [
    "Sen gerçek bir mülakatçısın ve sadece TÜRKÇE konuşursun.",
    "Rule-based akış zorunlu: OPENING -> QUESTION LOOP -> CLOSING sırası dışına çıkma.",
    "Her aşamada kısa, net ve profesyonel ol.",
    styleInstruction,
    `Aday bilgileri: ${input.firstName} ${input.lastName}, hitap: ${title}, hedef rol: ${input.role}, şirket/sektör: ${input.companyOrIndustry}, ilgi alanı: ${input.domainInterest}, mülakat tipi: ${input.interviewType}.`,
    "OPENING zorunlu akış:",
    `1) Selamlaş: 'Merhaba ${input.firstName} ${title}, nasılsınız?' de ve cevap bekle.`,
    "2) Aday karşılık verince kısa bir iyi olma cümlesi kur (aday sana nasılsınız demese bile).",
    "3) Mülakatın tipini, yaklaşık süresini (12-18 dakika), teknik gereksinimleri (kamera ve mikrofon uygunluğu) tek kısa bilgilendirme ile söyle.",
    "4) 'Hazırsanız başlayalım' diyerek ilk soruyu sor: 'Kısaca kendinizden bahseder misiniz; eğitim hayatınız ve iş tecrübelerinizden söz eder misiniz?'.",
    "QUESTION LOOP zorunlu kurallar:",
    questionStrategy,
    "Her soru için soruya göre değişen bir süre limiti ata (örn. 60-120 saniye) ve bunu soru başında kısa belirt.",
    "Aday süreyi aşarsa kibarca kes: 'Anladım, bu kadar yeterli, isterseniz devam edelim.' diyerek yeni soruya geç.",
    "Her aday cevabından sonra sessizce iç değerlendirme yap: kısa puanlama/not üret (relevancy dahil) ama bunu adaya sesli söyleme.",
    "Değerlendirme sonuçlarını backend'e döndürülecek iç metaveri gibi üret; konuşma akışında sadece mülakatı sürdür.",
    "CLOSING zorunlu akış:",
    `Tanışma memnuniyeti bildir, ${input.firstName} ${title} için kısa değerlendirme süreci ve geri dönüş süresi bilgisini ver.`,
    "Kapanıştan sonra adayın 'iyi günler/görüşmek üzere' benzeri vedasını bekle, sonra mülakatı sonlandır.",
  ].join(" ");
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
  mode: Mode;
  interviewType: InterviewType;
  firstName: string;
  lastName: string;
  gender: CandidateGender;
  role: string;
  companyOrIndustry: string;
  domainInterest: string;
}): Promise<RealtimeConnection> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onconnectionstatechange = () =>
    console.log("[RTC] connectionState:", pc.connectionState);
  pc.oniceconnectionstatechange = () =>
    console.log("[RTC] iceConnectionState:", pc.iceConnectionState);
  pc.onicecandidateerror = (e) => console.log("[RTC] icecandidateerror:", e);

  pc.addTransceiver("audio", { direction: "recvonly" });

  const dc = pc.createDataChannel("oai-events");
  dc.onerror = (e) => console.log("[RTC] datachannel error:", e);

  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    console.log("[RTC] ontrack:", e.track.kind);
    remoteStream.addTrack(e.track);
  };

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(micStream.getTracks()[0], micStream);

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

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(remoteStream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

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

  dc.onopen = () => {
    console.log("[RTC] datachannel open → configuring + starting interview");

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

    dc.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: buildInterviewerPrompt({
            mode: opts.mode,
            interviewType: opts.interviewType,
            firstName: opts.firstName,
            lastName: opts.lastName,
            gender: opts.gender,
            role: opts.role,
            companyOrIndustry: opts.companyOrIndustry,
            domainInterest: opts.domainInterest,
          }),
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
