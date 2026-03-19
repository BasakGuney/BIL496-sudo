type TranscriptEntry = { role: string; text: string; ts: number };
type CandidateAnswerAudio = {
  questionIndex: number;
  mimeType: string;
  startedAt: number;
  endedAt: number;
  audioBase64: string;
};

type ConnectOptions = {
  backendBaseUrl: string;
  sessionId: string;
  mode: string;
  interviewType: string;
  firstName: string;
  lastName: string;
  gender: string;
  role: string;
  companyOrIndustry: string;
  domainInterest: string;
};

async function blobToBase64(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function connectRealtimeInterview(_options: ConnectOptions) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);

  const audioEl = new Audio();
  const transcript: TranscriptEntry[] = [];
  const candidateAnswerAudios: CandidateAnswerAudio[] = [];

  let recorder: MediaRecorder | null = null;
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  if (typeof MediaRecorder !== 'undefined') {
    recorder = new MediaRecorder(stream, { mimeType });
    let chunks: Blob[] = [];
    let segmentStart = Date.now();
    let questionIndex = 1;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      if (!chunks.length) return;
      const blob = new Blob(chunks, { type: mimeType });
      chunks = [];
      const audioBase64 = await blobToBase64(blob);
      candidateAnswerAudios.push({
        questionIndex: questionIndex++,
        mimeType,
        startedAt: segmentStart,
        endedAt: Date.now(),
        audioBase64,
      });
      transcript.push({ role: 'candidate', text: '[Ses yanıtı kaydedildi]', ts: Date.now() });
      if (recorder && recorder.state === 'inactive') {
        segmentStart = Date.now();
        recorder.start();
        window.setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 15000);
      }
    };

    recorder.start();
    window.setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 15000);
  }

  return {
    analyser,
    audioCtx,
    audioEl,
    close() {
      if (recorder?.state === 'recording') recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
      source.disconnect();
      analyser.disconnect();
      void audioCtx.close();
    },
    getTranscript() {
      return transcript;
    },
    async getCandidateAnswerAudios() {
      return candidateAnswerAudios;
    },
  };
}
