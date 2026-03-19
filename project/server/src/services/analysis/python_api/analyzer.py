import os
import glob
import json
import requests
import torch
import librosa
import numpy as np
import torch.nn.functional as F
from transformers import AutoModelForAudioClassification, AutoModelForCTC, Wav2Vec2Processor, AutoFeatureExtractor
from generate_graphs import generate_final_radar_chart

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

def calculate_weighted_average_emotions(items):
    total_duration = sum(item['duration'] for item in items)
    if total_duration == 0: return {}
    
    overall_emotions = {}
    label_keys = items[0]['emotions'].keys()
    
    for key in label_keys:
        weighted_sum = sum(item['emotions'][key] * item['duration'] for item in items)
        overall_emotions[key] = round(weighted_sum / total_duration, 1)
        
    return overall_emotions

def calculate_weighted_average_clarity(items):
    total_duration = sum(item['duration'] for item in items)
    if total_duration == 0: return 0
    weighted_sum = sum(item['clarity'] * item['duration'] for item in items)
    return round(weighted_sum / total_duration, 1)

def interpret_report_with_llama(report_text, overall_emotions):
    label_translations = {
        'neu': 'Özgüven',
        'hap': 'Coşku',
        'ang': 'Sert Ton',
        'sad': 'Gerginlik'
    }

    # Compute all stats in Python - no room for LLM hallucination
    sorted_emotions = sorted(overall_emotions.items(), key=lambda x: x[1], reverse=True)
    dominant_key, dominant_score = sorted_emotions[0]
    dominant_label = label_translations.get(dominant_key, dominant_key)
    ozguven_score = overall_emotions.get('neu', 0)
    gerginlik_score = overall_emotions.get('sad', 0)
    cosku_score = overall_emotions.get('hap', 0)
    sert_ton_score = overall_emotions.get('ang', 0)
    prompt = f"""Sen üst düzey bir İK Stratejistisin. Görevin, adaya aşağıdaki KESİN MANTIKSAL SINIRLARA göre, duygusallıktan uzak ve YÜKSEK KALİTELİ DÜZGÜN TÜRKÇE ile dürüst bir geri bildirim raporu sunmaktır.

    ### 🚫 KESİNLİKLE YASAKLI KELİMELER VE İFADELER (BUNLARI YAZARSAN CEZA KESİLİR):
    - "Aday", "Adayın", "Görüyoruz", "Gördük", "Kıyasladığımızda", "Analizimiz", "Verilere göre", "Yüzdelere bakınca".
    - "Senin" kelimesini ASLA kullanma. (Örn: "Senin mülakat performansın" yerine direkt "Mülakat performansın" de).
    - "Sahipsin", "Sahibsiniz", "Yapıyorsun" gibi çeviri kokan kelimeler ASLA kullanılamaz. 

    ### ⚠️ ZORUNLU TÜRKÇE DİLBİLGİSİ KURALLARI VE ÜSLUP:
    - Kurumsal, acımasız ve son derece profesyonel bir İK dili kullan.
    - DİKKAT: Verilerdeki 'pure_speech_time' değeri ve diğer bütün süre metrikleri isminin aksine DAKİKA DEĞİL SANİYEDİR. (Örn: "Mülakatın 5. saniyesinde..." de).

    ### 📝 GÖRSEL FORMATLAMA (ZORUNLU):
    - YAZDIĞIN HER BİR CÜMLEYİ (nokta ile biten her ifadeyi) MUTLAKA BİR MADDE İŞARETİ (TİRE '-') İLE YENİ BİR SATIRDA YAZ.
    - Paragraf kullanmak YASAKTIR. Her başlığın altındaki her bir cümle alt alta tire (-) ile başlamalıdır.

    ### ⚖️ DUYGU ANALİZ VE YORUMLAMA MANTIĞI:

    1. SERT TON (ANG):
       - %40 Üstü: "İletişiminde baskın bir sertlik ve çatışmacı bir enerji var. Bu tutum profesyonel imajın için ciddi bir engel teşkil ediyor."
       - %15 - %40 Arası: "Zaman zaman fazla otoriter veya savunmacı bir üslup takınıyorsun. Bu durum iletişimi zorlaştırabilir."
       - %15 Altı: "Uyumlu ve yapıcı bir iletişim tonu yakaladın."

    2. ÖZGÜVEN (NEU) vs GERGİNLİK (SAD):
       - Gerginlik > Özgüven (Fark %10+): "Heyecanın, profesyonel yetkinliğini yansıtmana engel oldu; özgüvenin bu baskı altında geride kaldı."
       - Özgüven > Gerginlik: "Soğukkanlı ve özgüvenli bir duruş sergiledin."
       - Fark %10'dan Azsa: "Mülakat heyecanı ile mesleki disiplin arasında dengeli bir seyir izledin."

    3. COŞKU (HAP):
       - %10 Altı: "Düşük enerji ve monoton bir anlatımın var. İsteksiz veya heyecansız bir izlenim bırakıyorsun."
       - %30 Üstü: "Yüksek motivasyon ve ikna edici bir enerji seviyesiyle konuştun."

    ### ✍️ KESİN YAZIM KURALLARI:
    - BAŞLIKLA BAŞLA (## 🤖 Kariyer Koçu Analiz Raporu). Giriş cümlesi ASLA kullanma.
    - HİTAP: Doğrudan ve İYELİK EKLERİNE dikkat ederek "Sen" dili kullan.
    - Rakamları metinle doğal şekilde birleştir (Örn: "Sesindeki %76'lık bu sert tını...").

    ### 📋 RAPOR FORMATI (BİREBİR UYGULA, HER CÜMLE TİRE İLE BAŞLAYACAK):

    ## 🤖 Kariyer Koçu Analiz Raporu

    ### 🎭 Genel Duruşun ve Karakter Analizin
    - [Cümle 1]
    - [Cümle 2]

    ### ⚖️ Duygusal Dengelerin ve Stres Yönetimin
    - [Cümle 1]
    - [Cümle 2]

    ### ⚡ İletişim Enerjin ve Üslubun
    - [Cümle 1]
    - [Cümle 2]

    ### 📈 Mülakatın Zaman Çizelgesi ve Gelişimi
    - [Cümle 1]
    - [Cümle 2]

    RAPOR VERİSİ:
    {report_text}
    """

    url = "http://localhost:11434/api/generate"
    payload = {
        "model": "llama3.1",
        "prompt": prompt,
        "stream": False
    }

    try:
        # Increased timeout to 240 seconds for Ollama LLM to avoid local timeouts
        response = requests.post(url, json=payload, timeout=240)
        response.raise_for_status()
        result = response.json()
        return result.get("response", "Modelden boş bir yanıt döndü.")
    except requests.exceptions.Timeout:
        return "> ⚠️ **Zaman Aşımı:** LLM çok geç yanıt verdi (240sn saniye aşıldı). Lütfen daha güçlü bir model seçin veya bilgisayarınızın performansını kontrol edin."
    except Exception as e:
        return f"> ⚠️ **Ollama Bağlantı Hatası:** Yapay zeka değerlendirmesi alınamadı. Lütfen Ollama'nın çalıştığından (`ollama run llama3.1`) emin olun. Hata: {str(e)}"


def interpret_vision_report_with_llama(vision_analysis):
    overview = vision_analysis.get("overview", {}) if isinstance(vision_analysis, dict) else {}
    tension = vision_analysis.get("tension", {}) if isinstance(vision_analysis, dict) else {}
    diagnostics = vision_analysis.get("diagnostics", {}) if isinstance(vision_analysis, dict) else {}
    samples = vision_analysis.get("samples", []) if isinstance(vision_analysis, dict) else []

    prompt = f"""Sen kıdemli bir beden dili ve mülakat performansı koçusun. Aşağıdaki görsel mülakat metriklerini kullanarak yalnızca geçerli JSON döndür.

JSON şeması:
{{
  "status": "ok" | "warning" | "unavailable",
  "summary": "Kısa tek paragraf Türkçe özet",
  "scores": [
    {{"key": "camera_presence", "label": "Kamera Varlığı", "score": 0-100, "detail": "..."}},
    {{"key": "framing", "label": "Kadraj ve Merkezleme", "score": 0-100, "detail": "..."}},
    {{"key": "stability", "label": "Stabilite", "score": 0-100, "detail": "..."}},
    {{"key": "visual_stress", "label": "Görsel Stres", "score": 0-100, "detail": "..."}}
  ],
  "strengths": ["..."],
  "risks": ["..."],
  "recommendations": [{{"title": "...", "text": "..."}}]
}}

Kurallar:
- Sadece JSON döndür, markdown kullanma.
- Değerlendirmeyi yalnızca verilen sayısal verilerden türet.
- Türkçe yaz.
- recommendation listesinde 2-4 madde olsun.
- strengths ve risks listelerinde 1-4 madde olsun.
- Eğer status hazır değilse veya örnek sayısı çok düşükse bunu açıkça belirt.

VERİLER:
- status: {vision_analysis.get('status')}
- source: {vision_analysis.get('source')}
- sampledFrames: {overview.get('sampledFrames', 0)}
- faceDetectedFrames: {overview.get('faceDetectedFrames', 0)}
- missingFaceFrames: {overview.get('missingFaceFrames', 0)}
- facePresenceScore: {overview.get('facePresenceScore', 0)}
- focusScore: {overview.get('focusScore', 0)}
- centeringScore: {overview.get('centeringScore', 0)}
- steadinessScore: {overview.get('steadinessScore', 0)}
- averageFaceAreaRatio: {overview.get('averageFaceAreaRatio', 0)}
- averageCenterOffset: {overview.get('averageCenterOffset', 0)}
- headMovementRaw: {overview.get('headMovementRaw', 0)}
- visualTensionScore: {tension.get('visualTensionScore', 0)}
- attentionRiskScore: {tension.get('attentionRiskScore', 0)}
- movementRiskScore: {tension.get('movementRiskScore', 0)}
- eyeTensionScore: {tension.get('eyeTensionScore', 0)}
- attentionDriftRatio: {tension.get('attentionDriftRatio', 0)}
- dangerFrameRatio: {tension.get('dangerFrameRatio', 0)}
- lowEyeRatio: {tension.get('lowEyeRatio', 0)}
- warnFrames: {tension.get('warnFrames', 0)}
- dangerFrames: {tension.get('dangerFrames', 0)}
- lowEyeFrames: {tension.get('lowEyeFrames', 0)}
- detector: {json.dumps(diagnostics.get('detector'), ensure_ascii=False)}
- sampleCount: {len(samples)}
"""

    payload = {
        "model": "llama3.1",
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.1
        }
    }

    try:
        response = requests.post("http://localhost:11434/api/generate", json=payload, timeout=240)
        response.raise_for_status()
        result = response.json()
        response_text = result.get("response", "{}")
        parsed = json.loads(response_text)
        return {
            "status": str(parsed.get("status") or "ok"),
            "summary": str(parsed.get("summary") or "Görsel analiz özeti üretilemedi."),
            "scores": parsed.get("scores") if isinstance(parsed.get("scores"), list) else [],
            "strengths": parsed.get("strengths") if isinstance(parsed.get("strengths"), list) else [],
            "risks": parsed.get("risks") if isinstance(parsed.get("risks"), list) else [],
            "recommendations": parsed.get("recommendations") if isinstance(parsed.get("recommendations"), list) else [],
        }
    except Exception as e:
        return {
            "status": "warning" if vision_analysis.get("status") != "unavailable" else "unavailable",
            "summary": "Ollama yorum raporu üretilemedi; ham görsel metrikler kaydedildi.",
            "scores": [
                {"key": "camera_presence", "label": "Kamera Varlığı", "score": int(overview.get("facePresenceScore", 0) or 0), "detail": "Yüz görünürlüğü temel alınarak hesaplandı."},
                {"key": "framing", "label": "Kadraj ve Merkezleme", "score": int(overview.get("centeringScore", 0) or 0), "detail": "Merkezleme metriği temel alınarak hesaplandı."},
                {"key": "stability", "label": "Stabilite", "score": int(overview.get("steadinessScore", 0) or 0), "detail": "Baş hareketi metriği temel alınarak hesaplandı."},
                {"key": "visual_stress", "label": "Görsel Stres", "score": int(tension.get("visualTensionScore", 0) or 0), "detail": f"LLM bağlantı hatası nedeniyle doğrudan skor kullanıldı: {str(e)}"},
            ],
            "strengths": [],
            "risks": [f"Yapay zeka görsel yorum raporu üretilemedi: {str(e)}"],
            "recommendations": [
                {"title": "Ollama Bağlantısını Kontrol Et", "text": "Görsel koçluk raporu için Ollama servisinin çalışır durumda olduğundan emin ol."}
            ],
        }
