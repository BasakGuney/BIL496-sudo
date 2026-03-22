# Sistem Mimarisi — Detaylı Teknik Dokümantasyon

> **Proje:** AI Destekli Mülakat Simülatörü  
> **Son Güncelleme:** Mart 2025  
> **Stack:** Node.js (Express) + React (Vite) + Python 3.11 FastAPI  

---

## 1. Genel Mimari

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT (React/Vite)                     │
│  SetupPage → PreviewPage → InterviewPage → FeedbackPage          │
│  ─────────────────────────────────────────────────────────────── │
│  WebRTC (SDP)   WebSocket (events)   REST (report/status)        │
└──────────────┬──────────────────────────────┬────────────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│   Node.js / Express     │     │   Python FastAPI (port 8000)     │
│   AppServer.js          │────▶│   audio_analyzer.py             │
│   BackendOrchestrator   │     │   transcript_analyzer.py        │
│   AIServiceGateway      │     │   vision_analyzer.py (LLM part) │
│   OpenAI Realtime API   │     │   api.py (HTTP endpoint)        │
└─────────────────────────┘     └─────────────────────────────────┘
               │
               ▼
      OpenAI Realtime API (WebRTC/WebSocket)
      OpenAI Chat Completions API (gpt-4o-mini)
```

Sistem üç ana katmandan oluşur:
1. **React istemcisi** — kullanıcı arayüzü, oturum kurulumu, canlı mülakat, geri bildirim ekranı
2. **Node.js sunucusu** — oturum yönetimi, OpenAI Realtime entegrasyonu, analiz koordinasyonu
3. **Python API** — ağır makine öğrenmesi analizi (ses, görüntü, transcript) ve GPT yorum katmanı

---

## 2. Sunucu Dizin Yapısı ve Dosya İşlevleri

```
server/
├── index.js                          ← Giriş noktası (AppServer instanslagörüntüler ve listen)
├── src/
│   ├── AppServer.js                  ← Express kurulumu, route bağlantısı, middleware
│   │
│   ├── api/
│   │   ├── controllers/
│   │   │   ├── SessionController.js  ← POST /session, oturum başlatma/durdurma
│   │   │   ├── ReportController.js   ← GET /session/:id/report
│   │   │   ├── RealtimeController.js ← WebRTC SDP sunumu, WebSocket kurulumu
│   │   │   └── ConsentController.js  ← PATCH /session/:id/consent
│   │   ├── middleware/
│   │   │   └── ErrorHandlerMiddleware.js
│   │   └── routes/
│   │       └── (route tanımları)
│   │
│   ├── orchestration/
│   │   ├── BackendOrchestrator.js    ← Oturum yaşam döngüsü, analiz tetikleme, canlı hint/feedback
│   │   ├── GuardrailsEngine.js       ← Consent ve state doğrulama kuralları
│   │   ├── InterviewFlowPolicy.js    ← Mülakat akış politikası (OPENING → LOOP → CLOSING)
│   │   └── InterviewSessionOrchestrator.js ← Tek oturum bazında akış yönetimi
│   │
│   ├── services/
│   │   ├── ai/
│   │   │   ├── AIServiceGateway.js   ← Preview sorular, canlı hint, canlı feedback, OpenAI çağrıları
│   │   │   ├── OpenAIClientAdapter.js ← API key wrapper
│   │   │   ├── OpenAiRealtimeGateway.js ← WebRTC SDP oluşturma, Realtime API bağlantısı
│   │   │   └── PromptTemplates.js    ← Tüm sistem prompt'ları (interviewer, sorular, stil)
│   │   │
│   │   ├── analysis/
│   │   │   ├── AudioSignalProcessor.js    ← Ses dosyalarını Python API'ye aktarır
│   │   │   ├── BehaviorAnalyzer.js        ← Davranış sinyallerini değerlendirir
│   │   │   ├── CandidateAudioTranscriber.js ← Aday ses segmentlerini transkripte çevirir
│   │   │   ├── PythonAnalysisClient.js    ← Node↔Python HTTP köprüsü
│   │   │   ├── SignalAggregator.js        ← Birden fazla analiz çıktısını birleştirir
│   │   │   ├── TranscriptEvaluator.js     ← Transcript değerlendirme iş akışı
│   │   │   ├── VisionFrameAnalyzer.js     ← Kamera frame'lerini Python'a gönderir
│   │   │   └── VisionSignalProcessor.js   ← Vision sinyallerini işler
│   │   │
│   │   └── realtime/
│   │       ├── RealtimeSessionManager.js  ← Aktif Realtime oturumlarını tutar
│   │       ├── SessionConfigFactory.js    ← Oturum yapılandırma nesnesi üretir
│   │       ├── SessionUpdateBuilder.js    ← Realtime session.update mesaj formatı
│   │       └── TurnDetectionPolicy.js     ← VAD (Voice Activity Detection) parametreleri
│   │
│   ├── domain/
│   │   ├── entities/
│   │   │   └── InterviewSession.js   ← Oturum domain varlığı
│   │   ├── value-objects/
│   │   │   ├── SessionConfig.js      ← İsim, rol, zorluk, tip, mod gibi konfigürasyon
│   │   │   └── Consent.js            ← Mikrofon ve kamera onayı
│   │   ├── enums/
│   │   │   └── SessionState.js       ← CONFIGURED → CONSENT_GRANTED → ACTIVE → ENDED
│   │   └── errors/
│   │       └── AppError.js
│   │
│   ├── persistence/
│   │   ├── repositories/
│   │   │   ├── IReportRepository.js  ← Arayüz: save / findById
│   │   │   └── ISessionRepository.js
│   │   └── storage/
│   │       ├── InMemorySessionRepository.js ← Aktif oturumlar (sunucu süresi boyunca)
│   │       ├── InMemoryReportRepository.js  ← Aktif raporlar (sunucu süresi boyunca)
│   │       └── FileReportArchive.js         ← Oturum rapor JSON'larını diske yazar/okur
│   │
│   └── utils/
│
└── reports/
    └── S-{timestamp}/
        ├── audio_report.json         ← Ses analizi + GPT yorumu
        ├── transcript_report.json   ← Transcript soru-cevap değerlendirmesi
        └── vision_report.json        ← Görüntü analizi + GPT LLM raporu
```

---

## 3. Oturum Yaşam Döngüsü

```
1. CONFIGURED   → POST /session        (SessionConfig oluşturulur, WebRTC SDP hazırlanır)
2. CONSENT_GRANTED → PATCH /consent   (Mikrofon + kamera onayı alınır)
3. ACTIVE       → POST /session/start  (OpenAI Realtime bağlantısı kurulur, mülakat başlar)
4. ENDED        → POST /session/end    (Mülakat bitirilir, analiz pipeline'ı tetiklenir)
```

`BackendOrchestrator.js` bu dört geçişi koordine eder. Her geçişte `InMemorySessionRepository` güncellenir.

---

## 4. OpenAI Realtime Entegrasyonu

### 4.1 Bağlantı Modeli
- **WebRTC SDP** aracılığıyla istemci ↔ OpenAI Realtime API bağlantısı kurulur
- `OpenAiRealtimeGateway.js` SDP offer/answer değişimini yönetir
- Ses akışı **doğrudan istemci ↔ OpenAI** arasında WebRTC üzerinden gerçekleşir (sunucu sadece sinyal görevi görür)

### 4.2 Interviewer System Prompt'u
`PromptTemplates.js` → `sessionInstructions(cfg)` şunları birleştirir:

| Bileşen | İçerik |
|---|---|
| `baseInterviewerInstructions()` | Türkçe zorunluluğu, OPENING→LOOP→CLOSING akışı |
| `turkishInterviewerOpening(cfg)` | İsimli selamlama, mülakat türü/süresi açıklaması, "Hazırsanız başlayalım mı?" |
| `hrQuestionRules()` / `technicalQuestionRules(cfg)` | STAR tekniği (HR) veya rol/domain/zorluk bazlı teknik sorular (Technical) |
| `supportiveStyle()` / `neutralStyle()` | Mod bazlı davranış kuralları |

**Mülakat Tipleri:**
- **HR:** STAR yaklaşımı, 5–6 davranışsal soru, 1–2 dk/soru
- **Technical:** Rol + şirket/sektör + domain + zorluk seviyesine özel, 5–6 teknik soru, 2–3 dk/soru

**Zorluk Seviyeleri:** Junior (temel/kavramsal) · Intermediate (senaryo/optimizasyon)

### 4.3 Turn Detection (VAD)
`TurnDetectionPolicy.js` → `server_vad` modu, OpenAI'nın ses aktivite tespiti

---

## 5. Canlı Hint ve Feedback (Supportive Mod)

Sadece `mode: "Supportive"` seçildiğinde aktif olur.

### 5.1 Canlı Hint (`generateLiveHints`)
- **Ne zaman tetiklenir:** Mülakat sırasında mülakatçı yeni bir soru sorduğunda
- **Model:** `gpt-4o-mini` · `temperature: 0.6`
- **Filtreleme:** `isIntroQuestion()` — "hazırsanız başlayalım mı", "merhaba" gibi intro sorular için hint üretilmez
- **Çıktı:** 3 adet kısa yönlendirici ipucu (3–6 kelime)
  ```json
  {"hints": ["Önce problemi tanımla", "Kullandığın teknolojiyi detaylandır", "Somut bir sonuçtan bahset"]}
  ```

### 5.2 Canlı Feedback (`generateLiveFeedback`)
- **Ne zaman tetiklenir:** Aday soruyu yanıtladıktan sonra (cevap işlendiğinde)
- **Model:** `gpt-4o-mini` · `temperature: 0.6`
- **Filtreleme:**
  - Intro soru ise → feedback yok (`isIntroQuestion`)
  - Çok kısa/basit cevap ise (< 15 karakter, "evet", "hayır") → feedback yok (`isShortOrSimpleAnswer`)
- **Çıktı:** Tek bir toast (popup bildirimi) — puan verilmez, sadece kaliteli metin
  ```json
  {
    "type": "success | info | warning",
    "title": "Harika Cevap! | Şuna Dikkat Et | Gelişim Alanı",
    "message": "State yönetiminden bahsettin ama Context API gibi araçlardan da örnek vermeliydin."
  }
  ```
- **Kural:** Asla `+10 puan` tarzı ifade kullanılmaz. Yapıcı, yönlendirici, motivasyon odaklı.

---

## 6. Analiz Pipeline'ı (Oturum Sonu)

Mülakat bittiğinde `BackendOrchestrator.endSession()` şu adımları sırayla tetikler:

```
endSession()
  ├─ CandidateAudioTranscriber → ses segmentlerini birleştirir
  ├─ PythonAnalysisClient.analyzeAudio() → Python API /audio-analyze
  ├─ PythonAnalysisClient.analyzeTranscript() → Python API /transcript-analyze
  ├─ VisionFrameAnalyzer → birikmiş vision frame'lerini Python API'ye gönderir
  └─ FileReportArchive.save() → reports/S-{id}/ altına JSON'lar yazılır
```

---

## 7. Python API (`python_api/`)

### 7.1 `api.py` — FastAPI HTTP Sunucusu

| Endpoint | Metot | İşlev |
|---|---|---|
| `/health` | GET | Servis sağlık kontrolü |
| `/audio-analyze` | POST | Ses dosyası analizi |
| `/transcript-analyze` | POST | Transcript değerlendirmesi |
| `/vision-report` | POST | Vision LLM raporu |
| `/frame-analyze` | POST | Canlı frame yüz tespiti |

---

## 8. Ses Analizi (`audio_analyzer.py`)

### 8.1 Kullanılan Modeller

| Model | Hugging Face ID | Görev |
|---|---|---|
| **SUPERB Emotion** | `superb/wav2vec2-base-superb-er` | Duygu sınıflandırması (neu/hap/ang/sad) |
| **Wav2Vec2 Base** | `facebook/wav2vec2-base-960h` | Ses netliği (CTC confidence tabanlı) |

Her iki model de `torch` ile çalışır; GPU varsa CUDA, yoksa CPU kullanılır. Modeller ilk çalıştırmada `.model-cache/` altına indirilir.

### 8.2 Ham Metrik Çıkarımı

`AudioAnalyzer.process_audio(filepath)` → her ses segmenti için:

```
{
  "duration": float (saniye),
  "emotions": {"neu": 45.2, "hap": 30.1, "ang": 15.0, "sad": 9.7},
  "clarity": float (0-100),
  "speech": {
    "wpm": float,         ← Onset detection ile konuşma hızı
    "pause_ratio": float, ← Sessiz süre / toplam süre %
    "pure_speech_time": float
  }
}
```

**Netlik hesabı:** Wav2Vec2 CTC logitlerine softmax uygulanır → her zaman adımında max olasılık alınır → süre boyunca ortalanır → `(avg_confidence - 0.5) / 0.5 * 100` formülüyle 0–100 aralığına ölçeklenir.

**Konuşma hızı:** `librosa.onset.onset_strength` + `peak_pick` ile onset sayısı tahmin edilir, `/2.2` sabitiyle kelimeye dönüştürülür.

### 8.3 Ağırlıklı Ortalama (`compute_overall`)

Birden fazla ses segmenti varsa **süre ağırlıklı** ortalama alınır:
- Duygu dağılımı, netlik ve konuşma metrikleri her segment için segment süresiyle çarpılıp toplama bölünür.

### 8.4 Deterministik Skorlama (Python)

GPT'ye **hiçbir zaman** skor üretme görevi verilmez. Tüm sayısal skorlar Python tarafında hesaplanır:

| Skor | Hesap Mantığı |
|---|---|
| **Ses Netliği** | Wav2Vec2 CTC confidence → doğrudan 0–100 |
| **Duygusal Denge** | Baskın duygu yüzdesi: >60% → 30, >45% → 50, >35% → 65, diğer → 80 |
| **Konuşma Hızı** | İdeal: 110–150 WPM → 80; 90–110 veya 150–175 → 60; 70–90 veya 175–200 → 45; diğer → 30 |
| **Akıcılık** | Duraklama oranı: ≤15% → 85; ≤25% → 65; ≤40% → 45; diğer → 25 |

### 8.5 GPT Yorum Katmanı (`interpret_report_with_gpt`)

Python skorları hesaplandıktan sonra GPT'ye yalnızca **insan okunabilir metin** ürettirmek için şu bağlam gönderilir:

```
clarity: {value, band: "Yüksek/Orta/Düşük"}
avgWPM: {value, band: "İdeal aralıkta/Hızlı/Yavaş"}
pauseRatio: {value: "%40.6", band: "Fazla (sık durak)"}
totalSpeechTime: "3 dk 31 sn"   ← Saniye asla ham gönderilmez
totalDuration: "5 dk 12 sn"
dominantEmotion: {label, score}
```

**Model:** `gpt-4o-mini` · `temperature: 0.2` · `response_format: json_object`

GPT'nin ürettiği `scores` dizisindeki sayısal değerler Python'un deterministik sonuçlarıyla **üzerine yazılır** — GPT sadece `detail` alanını doldurur.

**Çıktı şeması:**
```json
{
  "overallAnalysis": "3-4 cümlelik metin (netlik, hız, duraklama, ton)",
  "clarityBadge": "Netlik seviyesi yüksek",
  "dominantEmotion": "Nötr ve dengeli ton",
  "secondaryEmotion": "Olumlu / canlı ifade",
  "scores": [
    {"label": "Ses Netliği", "score": 78, "detail": "..."},
    {"label": "Duygusal Denge", "score": 65, "detail": "..."},
    {"label": "Konuşma Hızı", "score": 60, "detail": "..."},
    {"label": "Akıcılık", "score": 45, "detail": "..."}
  ],
  "tonDistribution": [{"label": "...", "score": 45.2}],
  "speechSummary": ["madde 1", "madde 2", "madde 3"],
  "recommendations": {
    "nextInterview": "...",
    "performanceDevelopment": "..."
  }
}
```

---

## 9. Transcript Analizi (`transcript_analyzer.py`)

### 9.1 Genel Akış

```
Ham Transcript (metin dosyası)
  ↓
_merge_consecutive_candidate_lines()   ← Üst üste [Candidate] satırlarını birleştirir
  ↓
parse_transcript_python()              ← [Interviewer]/[Candidate] satır bazlı parse
  ↓
parse_transcript_to_structured_blocks_gpt()  ← GPT hangi bloklar "setup_or_meta"?
  ↓
Blok tipi birleştirme (substring eşleşme)
  ↓
Her "question" bloğu için analyze_single_qa_gpt()
  ↓
Genel değerlendirme için generate_overall_analysis_gpt()
```

### 9.2 İki Katmanlı Parse Stratejisi

**Neden iki parser?**
- `parse_transcript_python` — GPT'ye bağımlı değildir, hiçbir soru-cevap çiftini düşürmez. Güvenlik ağı görevi görür.
- `parse_transcript_to_structured_blocks_gpt` — GPT hangi blokların "setup_or_meta" (selamlama, hazırlık soruları, kapanış teşekkürleri) olduğuna karar verir.

**Eşleştirme:** GPT'nin kısaltılmış sorusu ile Python parser'ın ham metni **substring** karşılaştırmasıyla eşleştirilir (tam eşleşme yapılmaz — GPT geçiş ifadelerini atabilir).

### 9.3 Meta Soru Tespiti

GPT prompt'unda **açık kural listesi** verilmiştir. `setup_or_meta` olarak işaretlenmesi beklenenler:

- Selamlama: "Merhaba", "Hoş geldiniz", "İyi günler"
- Hazırlık teyidi: "Hazırsanız başlayalım mı?", "Başlayalım mı?"
- Süre/kural açıklaması: "Mülakatımız 30 dk sürecek"
- Akış yönlendirmesi: "Bir sonraki soruya geçelim"
- Kapanış/teşekkür: "Görüşmek üzere", "Başka sorunuz var mı?"

Bu ifadeler `excludedFromOverall: true, visibleInReport: false` olur.

### 9.4 Soru-Cevap Değerlendirmesi (`analyze_single_qa_gpt`)

**Model:** `gpt-4o-mini` · `temperature: 0.0` · `response_format: json_object`

**Soru Tipleri:**

| Tip | Açıklama |
|---|---|
| `self_presentation` | Kendini tanıtma |
| `motivation` | Motivasyon soruları |
| `behavioral` | Davranışsal (STAR) |
| `experience` | Deneyim odaklı |
| `technical_knowledge` | Teknik bilgi |
| `technical_experience` | Teknik deneyim |
| `problem_solving` | Problem çözme |

**Metrikler:**

| Metrik | Ne Zaman Aktif |
|---|---|
| `relevance` | Her zaman (zorunlu) |
| `clarity` | Her zaman (zorunlu) |
| `depth` | Her zaman (zorunlu) |
| `evidenceExample` | Sadece behavioral/experience sorularında |
| `technicalAccuracy` | Sadece technical_knowledge/technical_experience'da |

Uygunsuz metrikler **kesinlikle null** olur (0 değil).

### 9.5 Soru Skoru Hesaplama (Deterministik)

```python
self_presentation / motivation:
  score = rel*0.40 + clar*0.30 + dep*0.30

behavioral / experience:
  score = rel*0.30 + clar*0.20 + dep*0.25 + ev*0.25

technical_knowledge:
  score = rel*0.25 + clar*0.20 + dep*0.25 + tech*0.30

technical_experience / problem_solving:
  score = rel*0.20 + clar*0.15 + dep*0.20 + ev*0.25 + tech*0.20
```

Zayıf cevap eşiklerı: `score < 55` veya `depth < 50` veya `evidenceExample < 45` veya `technicalAccuracy < 50`.

### 9.6 Genel Analiz (`generate_overall_analysis_gpt`)

Tüm soru-cevap çiftleri ve birleşik skor verisi GPT'ye gönderilir. Kural listesi:

- Tek tek soruları tekrar anlatma — **pattern** bul
- `overallAnalysis` en az 3 paragraf (güçlü yönler, zayıf yönler, role uygunluk)
- `strengths` — tekrarlayan güçlü davranış örüntüleri
- `improvementAreas` — tekrarlayan zayıf noktalar (konu adı değil, davranış)
- `focusTopics` — somut konu başlıkları ("JWT Yapısı", "CSS Flexbox")
- `recommendations` — 3 kategori: "Bir Sonraki Mülakatta", "Performans Geliştirme", "Çalışma Planı"

### 9.7 Genel Skor Weighting

```python
Ağırlıklar:
  behavioral / experience / technical_knowledge / self_presentation / motivation → 1.2
  technical_experience / problem_solving → 1.4

overallScore = sum(score * weight) / sum(weight)
```

---

## 10. Görüntü Analizi (`vision_analyzer.py`)

Dosya iki ayrı sorumluluğa sahiptir:

### 10.1 Canlı Frame Analizi (Bölüm 1)

Mülakat sırasında her ~1 saniyede bir kamera frame'i `VisionFrameAnalyzer.js` tarafından Python'a gönderilir.

**Araçlar:**
- **MediaPipe BlazeFace** (TFLite) — yüz tespiti ve konumlandırma (primary)
- **OpenCV Haar Cascade** — MediaPipe mevcut değilse fallback
- **BlazeFace modeli:** `blaze_face_short_range.tflite` (`.model-cache/` altında otomatik indirilir)

**Çıktı (her frame):**
```json
{
  "faceCount": 1,
  "eyeCount": 2,
  "bbox": {"x": 0.3, "y": 0.2, "w": 0.4, "h": 0.5},
  "faceCropBase64": "...",
  "source": "mediapipe",
  "detector": {"used": "mediapipe", "mediapipeAvailable": true}
}
```

### 10.2 Oturum Sonu LLM Raporu (Bölüm 2)

`interpret_vision_report_with_gpt()` — birikmiş frame verilerinden GPT destekli final raporu.

**Model:** `gpt-4o-mini`

Rapor şeması (`vision_report.json`):
```json
{
  "report": {
    "overallScore": 72,
    "overallLabel": "İyi",
    "overallAnalysis": "...",
    "posture": {"score": 75, "label": "...", "detail": "..."},
    "eyeContact": {"score": 80, "label": "...", "detail": "..."},
    "facialExpression": {"score": 65, "label": "...", "detail": "..."},
    "composure": {"score": 70, "label": "...", "detail": "..."},
    "strengths": ["..."],
    "improvements": ["..."],
    "recommendations": ["..."]
  }
}
```

---

## 11. Kalıcılık ve Dosya Arşivi

### 11.1 InMemory Depolama
- `InMemorySessionRepository` ve `InMemoryReportRepository` — sadece sunucu çalışırken tutulur
- Sunucu restart edildiğinde kaybolur

### 11.2 `FileReportArchive.js`

Oturum sonunda raporları diske yazar:

```
reports/
  S-{timestamp}/
    audio_report.json        ← AudioAnalyzer çıktısı + GPT yorumu
    transcript_report.json   ← QA değerlendirmeleri + genel analiz
    vision_report.json        ← Frame özeti + GPT LLM raporu
```

`loadFeedbackArtifacts(sessionId)` bu JSON dosyalarını okuyarak tek bir nesne döndürür.

---

## 12. Feedback Ekranı (FeedbackPage)

Üç sekme: **Yanıt Analizi** · **Ses Analizi** · **Görüntü Analizi**

### 12.1 Veri Okuma Alanları

| Sekme | FeedbackReport Alanı |
|---|---|
| Yanıt Analizi | `report.transcriptReport` |
| Ses Analizi | `report.audioLlmReport` |
| Görüntü Analizi | `report.visionLlmAnalysis.report` |

### 12.2 `analysisStatus` ile Polling

`FeedbackPage` analizlerin tamamlanıp tamamlanmadığını `analysisStatus` ile takip eder:

```json
{
  "audio": true,        ← Ham ses analizi tamamlandı
  "audioLlm": true,     ← GPT yorum katmanı tamamlandı
  "transcript": true,   ← Transcript değerlendirmesi tamamlandı
  "vision": true,       ← Frame birikimi tamamlandı
  "visionLlm": true     ← Vision LLM raporu tamamlandı
}
```

Tüm alanlar `true` olana kadar belirli aralıklarla `GET /session/:id/report` çağrısı yapılır.

---

## 13. Kullanılan Tüm Modeller / API'lar — Özet Tablosu

| Servis | Model / Sürüm | Nerede | Amaç |
|---|---|---|---|
| OpenAI Realtime | `gpt-4o-realtime-preview` | Node.js | Canlı AI mülakatçı ses akışı |
| OpenAI Chat | `gpt-4o-mini` | Node.js | Preview sorular |
| OpenAI Chat | `gpt-4o-mini` | Node.js | Canlı hint (Supportive mod) |
| OpenAI Chat | `gpt-4o-mini` | Node.js | Canlı feedback (Supportive mod) |
| OpenAI Chat | `gpt-4o-mini` | Python | Audio GPT yorum katmanı |
| OpenAI Chat | `gpt-4o-mini` | Python | Transcript blok parse |
| OpenAI Chat | `gpt-4o-mini` | Python | Transcript soru değerlendirmesi |
| OpenAI Chat | `gpt-4o-mini` | Python | Transcript genel analiz |
| OpenAI Chat | `gpt-4o-mini` | Python | Vision LLM raporu |
| `superb/wav2vec2-base-superb-er` | Wav2Vec2 Fine-tuned | Python | Ses duygu sınıflandırması |
| `facebook/wav2vec2-base-960h` | Wav2Vec2 Base | Python | Ses netliği (CTC confidence) |
| MediaPipe BlazeFace | `blaze_face_short_range.tflite` | Python | Canlı yüz tespiti |
| OpenCV Haar | `haarcascade_frontalface_default.xml` | Python | Yüz tespiti fallback |

---

## 14. Geliştirici Notları

### Kurulum ve Çalıştırma

**Terminal 1 — Python API:**
```powershell
cd server/src/services/analysis/python_api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python api.py
```

**Terminal 2 — Node.js Sunucusu:**
```powershell
cd server
$env:PYTHON_BIN="...\.venv\Scripts\python.exe"
npm install
npm run dev
```

**Terminal 3 — React İstemcisi:**
```powershell
cd client
npm install
npm run dev
```

### Önemli Tasarım Kararları

1. **Skor üretimi her zaman Python'da (deterministik)** — GPT asla skor üretmez, yalnızca metin yorumlama yapar. Bu GPT halüsinasyonunun sayısal sonuçlara yansımasını engeller.

2. **İki katmanlı transcript parse** — Python parser güvenlik ağıdır; GPT meta etiketleyicidir. GPT blok düşürse bile Python listesindeki bloklar korunur.

3. **Supportive mod** — Gerçek zamanlı geri bildirim verirken kural: puan/not ifadesi yasak. Yapıcı ve motive edici ton zorunludur.

4. **InMemory → FileArchive ayrımı** — Aktif oturumlar bellekte, tamamlanan raporlar diskte. Bu iki sistemin karışmaması için ayrı repository katmanları tutulmuştur.
