import os
import glob
import json
import requests
import torch
import librosa
import numpy as np
import torch.nn.functional as F
from transformers import AutoModelForAudioClassification, AutoModelForCTC, Wav2Vec2Processor, AutoFeatureExtractor

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    try:
        with open("../../../../../.env", "r") as _f:
            for _line in _f:
                if _line.startswith("OPENAI_API_KEY="):
                    OPENAI_API_KEY = _line.split("=", 1)[1].strip()
    except Exception:
        pass

class AudioAnalyzer:
    def __init__(self, 
                 emotion_model_name="superb/wav2vec2-base-superb-er",
                 clarity_model_name="facebook/wav2vec2-base-960h"):
        print(f"Loading Models...")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Emotion Model (SUPERB)
        print(f" - Emotion Model: {emotion_model_name}")
        self.emotion_extractor = AutoFeatureExtractor.from_pretrained(emotion_model_name)
        self.emotion_model = AutoModelForAudioClassification.from_pretrained(emotion_model_name).to(self.device)
        self.emotion_labels = self.emotion_model.config.id2label
        
        # Clarity/Intelligibility Model (Wav2Vec2 Base 960h)
        print(f" - Clarity Model: {clarity_model_name}")
        self.clarity_processor = Wav2Vec2Processor.from_pretrained(clarity_model_name)
        self.clarity_model = AutoModelForCTC.from_pretrained(clarity_model_name).to(self.device)
        
        self.sampling_rate = 16000 

    def _get_emotions(self, audio_array):
        inputs = self.emotion_extractor(audio_array, sampling_rate=self.sampling_rate, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            outputs = self.emotion_model(**inputs)
        probs = F.softmax(outputs.logits, dim=-1)[0].cpu().numpy()
        emotions = {self.emotion_labels[i]: round(float(prob * 100), 1) for i, prob in enumerate(probs)}
        return emotions

    def _get_clarity_score(self, audio_array):
        """
        Calculates a clarity/intelligibility score based on CTC confidence.
        High confidence in phoneme recognition correlates with clear speech.
        """
        inputs = self.clarity_processor(audio_array, sampling_rate=self.sampling_rate, return_tensors="pt", padding=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        with torch.no_grad():
            logits = self.clarity_model(inputs["input_values"]).logits
            
        # Get softmax probabilities
        probs = F.softmax(logits, dim=-1)
        
        # Get the max probability at each time step (confidence)
        confidences, _ = torch.max(probs, dim=-1)
        
        # Average confidence across the sequence
        avg_confidence = torch.mean(confidences).item()
        
        # Scale to 0-100. Base Wav2Vec2 confidence is often naturally high, 
        # so we apply a slight non-linear scaling to make it more descriptive.
        # 0.7 -> 50, 0.9 -> 90 roughly.
        clarity = (avg_confidence - 0.5) / 0.5 * 100
        return round(max(0.0, min(100.0, clarity)), 1)

    def _get_speech_metrics(self, audio_array, sr, duration):
        non_mute_intervals = librosa.effects.split(audio_array, top_db=25)
        speaking_duration = sum([(end - start) / sr for start, end in non_mute_intervals])
        pause_ratio = (duration - speaking_duration) / duration if duration > 0 else 0

        onset_env = librosa.onset.onset_strength(y=audio_array, sr=sr)
        peaks = librosa.util.peak_pick(onset_env, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
        wpm = (len(peaks) / 2.2) / (speaking_duration / 60) if speaking_duration > 0 else 0

        return {
            "wpm": round(wpm, 1),
            "pause_ratio": round(pause_ratio * 100, 1),
            "pure_speech_time": round(speaking_duration, 2)
        }

    def process_audio(self, filepath):
        y, sr = librosa.load(filepath, sr=self.sampling_rate)
        duration = librosa.get_duration(y=y, sr=sr)
        if duration < 0.5: return None

        emotions = self._get_emotions(y)
        clarity = self._get_clarity_score(y)
        speech = self._get_speech_metrics(y, sr, duration)

        return {
            "duration": round(duration, 2), 
            "emotions": emotions, 
            "clarity": clarity,
            "speech": speech
        }

def compute_overall(items: list) -> dict:
    """
    Computes overall duration-weighted averages for emotions, clarity, and speech metrics
    across all processed audio segments.
    """
    if not items:
        return {
            "clarity": 0.0,
            "emotions": {},
            "speech": {"avg_wpm": 0.0, "avg_pause_ratio": 0.0, "total_speech_time": 0.0, "total_duration": 0.0}
        }

    total_duration = sum(item.get("duration", 0) for item in items)
    if total_duration == 0:
        return {
            "clarity": 0.0,
            "emotions": {},
            "speech": {"avg_wpm": 0.0, "avg_pause_ratio": 0.0, "total_speech_time": 0.0, "total_duration": 0.0}
        }

    # 1. Overall Emotions
    overall_emotions = {}
    label_keys = items[0].get("emotions", {}).keys()
    for key in label_keys:
        weighted_sum = sum(item["emotions"].get(key, 0) * item.get("duration", 0) for item in items)
        overall_emotions[key] = round(weighted_sum / total_duration, 1)

    # 2. Overall Clarity
    weighted_clarity_sum = sum(item.get("clarity", 0) * item.get("duration", 0) for item in items)
    overall_clarity = round(weighted_clarity_sum / total_duration, 1)

    # 3. Overall Speech Metrics
    valid_speech_items = [i for i in items if i.get("speech")]
    if valid_speech_items:
        speech_duration = sum(i.get("duration", 0) for i in valid_speech_items)
        if speech_duration > 0:
            avg_wpm = sum(i["speech"].get("wpm", 0) * i.get("duration", 0) for i in valid_speech_items) / speech_duration
            avg_pause = sum(i["speech"].get("pause_ratio", 0) * i.get("duration", 0) for i in valid_speech_items) / speech_duration
        else:
            avg_wpm = 0.0
            avg_pause = 0.0
            
        total_speech_time = sum(i["speech"].get("pure_speech_time", 0) for i in valid_speech_items)
    else:
        avg_wpm = 0.0
        avg_pause = 0.0
        total_speech_time = 0.0

    return {
        "clarity": overall_clarity,
        "emotions": overall_emotions,
        "speech": {
            "avg_wpm": round(avg_wpm, 1),
            "avg_pause_ratio": round(avg_pause, 1),
            "total_speech_time": round(total_speech_time, 2),
            "total_duration": round(total_duration, 2)
        }
    }


def _compute_emotion_suitability_score(emotions: dict) -> int:
    """
    Deterministik: Mülakat bağlamında duygu tonu uygunluğu.
    Nötr + olumlu tonları destekler, öfke ve düşük enerjiye ceza verir.
    """
    if not emotions:
        return 50
    neu = float(emotions.get("neu", 0) or 0)
    hap = float(emotions.get("hap", 0) or 0)
    ang = float(emotions.get("ang", 0) or 0)
    sad = float(emotions.get("sad", 0) or 0)

    positive = (neu * 0.6) + (hap * 1.0)
    negative = (ang * 1.0) + (sad * 0.9)
    score = 50 + (positive - negative) * 0.5
    return int(round(max(0, min(100, score))))



def _compute_speech_rate_score(avg_wpm: float) -> int:
    """İdeal: 110-150 WPM → en yüksek skor."""
    if 110 <= avg_wpm <= 150:
        return 80
    elif 90 <= avg_wpm < 110 or 150 < avg_wpm <= 175:
        return 60
    elif 70 <= avg_wpm < 90 or 175 < avg_wpm <= 200:
        return 45
    else:
        return 30


def _compute_fluency_score(pause_ratio: float) -> int:
    """Duraklama oranı düşükse akıcılık skoru yüksek."""
    if pause_ratio <= 15:
        return 85
    elif pause_ratio <= 25:
        return 65
    elif pause_ratio <= 40:
        return 45
    else:
        return 25


def interpret_report_with_gpt(overall: dict) -> dict:
    """
    Python computes ALL scores deterministically.
    GPT only writes human-readable text strictly matching the UI schema.
    No numbers are ever generated by GPT.
    """
    EMOTION_MAP = {
        "neu": "Nötr ve dengeli ton", "hap": "Olumlu / canlı ifade",
        "ang": "Gergin / sert ton", "sad": "Düşük enerjili / içe kapanık ton"
    }
    raw_emotions = overall.get("emotions", {})
    emotion_dist = [
        {"label": EMOTION_MAP.get(k, k), "score": v}
        for k, v in sorted(raw_emotions.items(), key=lambda x: x[1], reverse=True)
    ]
    dominant_emotion = emotion_dist[0] if emotion_dist else {"label": "Bilinmiyor", "score": 0}
    secondary_emotion = emotion_dist[1] if len(emotion_dist) > 1 else None

    clarity_val = overall.get("clarity", 0)
    speech_data = overall.get("speech", {})
    avg_wpm = speech_data.get("avg_wpm", 0)
    avg_pause_ratio = speech_data.get("avg_pause_ratio", 0)
    total_speech_sec = speech_data.get("total_speech_time", 0)
    total_dur_sec = speech_data.get("total_duration", 0)

    # Saniyeyi okunabilir dakika:saniye formatına çevir
    def _fmt_duration(sec: float) -> str:
        sec = int(round(sec))
        m, s = divmod(sec, 60)
        return f"{m} dk {s} sn" if m else f"{s} sn"

    # GPT'ye gidecek bağlam — saniye asla ham olarak gönderilmez
    clarity_band = (
        "Yüksek" if clarity_val >= 75
        else "Orta" if clarity_val >= 50
        else "Düşük"
    )
    wpm_band = (
        "İdeal aralıkta" if 110 <= avg_wpm <= 150
        else "Hızlı" if avg_wpm > 150
        else "Yavaş" if avg_wpm > 0
        else "Ölçülemedi"
    )
    pause_band = (
        "Az (akıcı)" if avg_pause_ratio <= 15
        else "Orta" if avg_pause_ratio <= 25
        else "Fazla (sık durak)" if avg_pause_ratio <= 40
        else "Çok Fazla"
    )

    # 2. Deterministik skorları hesapla
    emotion_suitability = _compute_emotion_suitability_score(raw_emotions)
    positive_share = round(float(raw_emotions.get("neu", 0) or 0) + float(raw_emotions.get("hap", 0) or 0), 1)
    negative_share = round(float(raw_emotions.get("ang", 0) or 0) + float(raw_emotions.get("sad", 0) or 0), 1)

    python_scores = [
        {"label": "Ses Netliği",      "score": int(round(clarity_val))},
        {"label": "Duygu Uygunluğu",  "score": emotion_suitability},
        {"label": "Konuşma Hızı",     "score": _compute_speech_rate_score(avg_wpm)},
        {"label": "Akıcılık",         "score": _compute_fluency_score(avg_pause_ratio)},
    ]
    s0, s1, s2, s3 = (p["score"] for p in python_scores)

    gpt_context = {
        "clarity": {"value": round(clarity_val, 1), "band": clarity_band},
        "avgWPM": {"value": avg_wpm, "band": wpm_band},
        "pauseRatio": {"value": f"%{round(avg_pause_ratio, 1)}", "band": pause_band},
        "totalSpeechTime": _fmt_duration(total_speech_sec),
        "totalDuration": _fmt_duration(total_dur_sec),
        "dominantEmotion": dominant_emotion,
        "secondaryEmotion": secondary_emotion,
        "emotionDistribution": emotion_dist,
        "emotionSuitability": {
            "score": emotion_suitability,
            "positiveShare": positive_share,
            "negativeShare": negative_share,
        },
    }

    prompt = f"""Sen bir mülakat performans raporu oluşturucususun. SADECE geçerli JSON döndür.

Sana verilen veri, adayın konuşmasına ait ONCEDEN HESAPLANMIS sayısal metriklerdir.
Görevin: Bu metrikleri yorumlayarak nesnel Türkçe metin alanları üretmek.

ÖNEMLİ KURALLAR:
- Sadece verilen veriyi kullan. Sayı veya skor üretme.
- scores listesinde detail alanını ilgili skor için 2-3 cümlelik açıklama ile doldur.
- Psikolojik analiz yapma ("özgüven", "karakter" vs). Emoji kullanma.
- Çelişkili ifadeler yazma.
- Süre ifadelerini SADECE verilen formatta ("3 dk 31 sn" gibi) yaz; verilen değeri olduğu gibi kullan.
- overallAnalysis 5-6 cümle olsun; ses netliği, konuşma hızı, duraklama düzeni, duygu uygunluğu ve süre kullanımı hakkında ayrı cümleler içersin.
- speechSummary en az 4, en fazla 5 maddeden oluşsun.
- recommendations.nextInterview ve recommendations.performanceDevelopment en az 2 cümle olsun.
- Duygu uygunluğu, emotionSuitability alanındaki skor ve positive/negative paylara dayanmalı.

Giriş Verisi:
{json.dumps(gpt_context, ensure_ascii=False, indent=2)}

SADECE şu JSON yapısını döndür:
{{
  "overallAnalysis": "Ses netliği, konuşma hızı, duraklama oranı ve ton dağılımını ayrı cümlelerle ele alan 3-4 cümlelik nesnel değerlendirme",
  "clarityBadge": "Netlik durumunu belirten kısa rozet metni (örn: 'Netlik seviyesi yüksek')",
  "dominantEmotion": "Baskın Duygu Özeti (örn: 'Düşük enerjili / içe kapanık ton')",
  "secondaryEmotion": "İkinci Duygu Özeti (örn: 'Olumlu / canlı ifade' veya null)",
  "scores": [
    {{"label": "Ses Netliği",      "score": {s0}, "detail": "..."}},
    {{"label": "Duygu Uygunluğu",  "score": {s1}, "detail": "..."}},
    {{"label": "Konuşma Hızı",     "score": {s2}, "detail": "..."}},
    {{"label": "Akıcılık",         "score": {s3}, "detail": "..."}}
  ],
  "tonDistribution": [
    {{"label": "...", "score": 100.0}}
  ],
  "speechSummary": ["madde 1", "madde 2", "madde 3 (netlik, akış, ton)"],
  "recommendations": {{
    "nextInterview": "Bir Sonraki Mülakatta paragrafı...",
    "performanceDevelopment": "Performans Geliştirme paragrafı..."
  }}
}}"""

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output valid JSON only. No markdown, no explanation."},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }

    try:
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()
        try:
            parsed = json.loads(result["choices"][0]["message"]["content"])
            # Validate output matches the expected Python scores
            for s in parsed.get("scores", []):
                for ps in python_scores:
                    if s["label"] == ps["label"]:
                        s["score"] = ps["score"]
                        break
            return parsed
        except Exception:
            # Fallback if parsing fails but request succeeded
            pass

        return {
            "overallAnalysis": "GPT yorumu işlenirken bir hata oluştu.",
            "clarityBadge": "Analiz Edilemedi",
            "dominantEmotion": dominant_emotion["label"],
            "secondaryEmotion": secondary_emotion["label"] if secondary_emotion else None,
            "scores": python_scores,
            "tonDistribution": emotion_dist,
            "speechSummary": [],
            "recommendations": {"nextInterview": "", "performanceDevelopment": ""}
        }

    except Exception as e:
        print(f"GPT Audio Interpret Error: {e}")
        # Pure Python fallback — no GPT at all
        return {
            "overallAnalysis": f"Oturum ses metrikleri başarıyla çıkarıldı. Ancak GPT üretimi başarısız: {e}",
            "clarityBadge": "Analiz Edilemedi",
            "dominantEmotion": dominant_emotion["label"],
            "secondaryEmotion": secondary_emotion["label"] if secondary_emotion else None,
            "scores": python_scores,
            "tonDistribution": emotion_dist,
            "speechSummary": [],
            "recommendations": {"nextInterview": "", "performanceDevelopment": ""}
        }
