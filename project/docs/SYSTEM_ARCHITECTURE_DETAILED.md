# Sistem Mimarisi — Detaylı Teknik Dokümantasyon

> **Proje:** AI Destekli Mülakat Simülatörü  
> **Son Güncelleme:** Nisan 2026  
> **Stack:** Node.js (Express) + React (Vite) + Python 3.11 (FastAPI)

---

## 1. Genel Mimari

```text
┌────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React/Vite)                        │
│ SetupPage → PreviewPage → InterviewPage → FeedbackPage            │
│                                                                    │
│ 1) REST /session, /preview-questions, /session/:id/report          │
│ 2) WebRTC offer (Node üzerinden OpenAI Realtime'e)                │
│ 3) Incremental audio + vision frame upload (Node API)              │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                      NODE.JS ORCHESTRATION LAYER                  │
│ AppServer + Controllers + BackendOrchestrator                     │
│ - Session lifecycle / consent / report endpoints                  │
│ - Realtime session setup (OpenAI gateway)                         │
│ - Transcript + vision runtime toplama                             │
│ - Archive yazımı + Python analiz tetikleme                        │
└───────────────────────┬────────────────────────────────────────────┘
                        │ HTTP (localhost:8000)
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│                         PYTHON ANALYSIS API                        │
│ api.py + audio_analyzer.py + transcript_analyzer.py + vision_analyzer.py │
│ - /analyze-audio        (ham + LLM ses raporu)                    │
│ - /analyze-transcript   (soru/cevap analizi)                      │
│ - /analyze-vision       (vision final LLM raporu)                 │
│ - /analyze-frame        (canlı frame inference)                   │
└────────────────────────────────────────────────────────────────────┘
```

Sistem 3 katmandan oluşur:
1. **Client**: kullanıcı etkileşimi, canlı mülakat deneyimi, rapor ekranı.
2. **Node backend**: oturum yönetimi, Realtime entegrasyonu, artifact/pipeline koordinasyonu.
3. **Python backend**: ses/transcript/görüntü hesaplamaları ve raporlayıcı LLM adımları.

---

## 2. Sunucu Dizin Yapısı ve Dosya İşlevleri

Aşağıdaki yapı `project/server/src` güncel akışına göre özetlenmiştir:

```text
server/
├── index.js
├── src/
│   ├── AppServer.js
│   │   ├── dependency wiring (AIServiceGateway, BackendOrchestrator, PythonAnalysisClient)
│   │   ├── CORS + JSON/body parser
│   │   └── router + global error handler
│   │
│   ├── api/
│   │   ├── controllers/
│   │   │   ├── SessionController.js
│   │   │   ├── ConsentController.js
│   │   │   ├── RealtimeController.js
│   │   │   └── ReportController.js
│   │   ├── middleware/
│   │   │   └── ErrorHandlerMiddleware.js
│   │   └── routes/
│   │       └── sessionRoutes.js
│   │
│   ├── orchestration/
│   │   ├── BackendOrchestrator.js
│   │   ├── GuardrailsEngine.js
│   │   └── InterviewFlowPolicy.js
│   │
│   ├── services/
│   │   ├── ai/
│   │   │   ├── AIServiceGateway.js
│   │   │   ├── OpenAIClientAdapter.js
│   │   │   ├── OpenAiRealtimeGateway.js
│   │   │   └── PromptTemplates.js
│   │   ├── analysis/
│   │   │   ├── BehaviorAnalyzer.js
│   │   │   ├── CandidateAudioTranscriber.js
│   │   │   ├── PythonAnalysisClient.js
│   │   │   ├── TranscriptEvaluator.js
│   │   │   ├── TranscriptSignalProcessor.js
│   │   │   ├── VisionFrameAnalyzer.js
│   │   │   ├── VisionSignalProcessor.js
│   │   │   └── InterviewSignalAggregator.js
│   │   └── realtime/
│   │       ├── RealtimeSessionManager.js
│   │       ├── SessionUpdateBuilder.js
│   │       └── TurnDetectionPolicy.js
│   │
│   ├── dto/responses/views/
│   │   └── ReportView.js
│   │
│   ├── persistence/
│   │   ├── repositories/
│   │   └── storage/
│   │       ├── InMemorySessionRepository.js
│   │       ├── InMemoryReportRepository.js
│   │       └── FileReportArchive.js
│   │
│   ├── domain/
│   │   ├── entities/InterviewSession.js
│   │   ├── enums/SessionState.js
│   │   ├── errors/AppError.js
│   │   └── value-objects/{SessionConfig, Consent}.js
│   └── config/env.js
└── reports/
```

**Önemli not:** `reports/S-...` altında sadece final rapor değil, incremental ses dosyaları, transcript ve vision artifacts da tutulur.

---

## 3. Oturum Yaşam Döngüsü

Güncel lifecycle (Node tarafı):

1. `POST /session` → `createSession`
   - SessionConfig normalize edilir.
   - Gerekirse WebRTC offer/answer hazırlanır.
   - Session `CONFIGURED` state ile belleğe yazılır.

2. `PATCH /session/:id/consent` → `updateConsent`
   - Mikrofon/kamera onayı kontrol edilir.
   - Session `CONSENT_GRANTED` olur.

3. `POST /session/:id/start` → `startSession`
   - Guardrail state doğrulaması yapılır.
   - Session `ACTIVE` olur.
   - İlk soru AIServiceGateway ile üretilir.

4. Mülakat sırasında:
   - Incremental answer audio (`/session/:id/answer`) alınır.
   - Vision frame (`/session/:id/vision/frame`) alınır.
   - Runtime state içinde audio/vision sayaçları güncellenir.

5. `POST /session/:id/end` → `endSession`
   - Transcript ve runtime audio birleştirilir.
   - Aday audio transkripsiyonu transcript'e merge edilir.
   - BehaviorAnalyzer ile ilk rapor üretilir.
   - Rapor memory + file archive'a yazılır.
   - Python analizleri async tetiklenir (audio/transcript/vision).

---

## 4. OpenAI Realtime Entegrasyonu

### 4.1 Bağlantı Modeli

- Client SDP offer’ı Node’a gönderir (`/realtime/offer`).
- Node `OpenAiRealtimeGateway` üzerinden OpenAI Realtime answer üretir.
- Ses medya akışı client ↔ OpenAI arasında gerçekleşir; Node sinyal/orkestrasyon katmanıdır.

### 4.2 Interviewer System Prompt'u

`PromptTemplates` + `SessionUpdateBuilder` ile:
- Interview type (HR / Technical),
- role / domain / difficulty,
- mode (neutral/supportive),
- açılış-kapanış ve soru üretim kuralları,
tek bir session instruction setine dönüştürülür.

### 4.3 Turn Detection (VAD)

`TurnDetectionPolicy` OpenAI `server_vad` parametrelerini merkezileştirir. Amaç:
- kısa kesmeleri azaltmak,
- adayın cevabı bitmeden turn sonlandırmamak,
- daha doğal konuşma ritmi sağlamak.

---

## 5. Canlı Hint ve Feedback (Supportive Mod)

Supportive mod aktifken iki endpoint kullanılır:

1. `POST /session/:id/supportive/hints`
   - Soru bağlamına göre kısa yönlendirme ipuçları üretir.
2. `POST /session/:id/supportive/feedback`
   - Aday cevabına bağlı kısa, yapıcı geri bildirim üretir.

Kurallar:
- Meta açılış/kapanış gibi turn’lerde gereksiz feedback üretilmez.
- Geri bildirim formatı kısa ve uygulanabilir olmalıdır.
- Puan/ceza dili yerine geliştirme odaklı ifade tercih edilir.

---

## 6. Analiz Pipeline'ı (Oturum Sonu)

`BackendOrchestrator.endSession()` sonrası pipeline iki fazlıdır:

### Faz A — Senkron (kullanıcıya ilk rapor dönüşü)
1. Runtime + request transcript normalize/merge.
2. `CandidateAudioTranscriber` ile candidate answer audio → text.
3. STT text ile transcript satırları zaman bazlı eşleştirilir.
4. `BehaviorAnalyzer.generateReport(...)` ile ilk rapor oluşturulur.
5. InMemory report repository’ye kaydedilir.

### Faz B — Asenkron (artifact zenginleştirme)
1. `FileReportArchive.save(...)` tüm session artifact’larını diske yazar.
2. `PythonAnalysisClient.analyzeSessionAndTranscript(...)` çağrılır:
   - audio (gerekli WAV dönüşümleriyle),
   - transcript,
   - vision payload.
3. Client `GET /session/:id/report` polling ile yeni artifact’ları alır.

---

## 7. Python API (`python_api/`)

### 7.1 `api.py` — FastAPI HTTP Sunucusu

Güncel endpoint isimleri:

| Endpoint | Metot | İşlev |
|---|---|---|
| `/health` | GET | Servis durum kontrolü |
| `/analyze-audio` | POST | Ses dosyaları için segment + overall analiz |
| `/analyze-transcript` | POST | Transcript/QA bazlı değerlendirme |
| `/analyze-vision` | POST | Vision aggregate payload için final rapor |
| `/analyze-frame` | POST | Tek frame inference (canlı vision) |

Not: Node tarafındaki `PythonAnalysisClient` bu endpointlerle birebir uyumludur.

---

## 8. Ses Analizi (`audio_analyzer.py`)

### 8.1 Kullanılan Modeller

- `superb/wav2vec2-base-superb-er` → duygu dağılımı
- `facebook/wav2vec2-base-960h` → netlik/intelligibility

### 8.2 Ham Metrik Çıkarımı

Segment bazında:
- duration,
- emotion distribution,
- clarity,
- speech metrics (`wpm`, `pause_ratio`, `pure_speech_time`).

### 8.3 Ağırlıklı Ortalama (`compute_overall`)

Birden fazla segmentte süre-ağırlıklı ortalama alınır.

### 8.4 Deterministik Skorlama (Python)

Sayısal skorlar Python tarafında üretilir; GPT skoru yazmaz.
Örn:
- konuşma hızı band skoru,
- pause ratio tabanlı akıcılık skoru,
- duygu dengesi skoru.

### 8.5 GPT Yorum Katmanı (`interpret_report_with_gpt`)

GPT sadece metinsel anlatımı üretir:
- overall analysis,
- rozet/özet cümleler,
- güçlü-geliştirilebilir alanlar,
- öneri maddeleri.

Sayısal alanlar deterministic çıktıdan korunur.

---

## 9. Transcript Analizi (`transcript_analyzer.py`)

### 9.1 Genel Akış

1. Transcript satırları normalize edilir.
2. Candidate satır birleştirme uygulanır.
3. GPT-first parse ile question/setup_or_meta blokları çıkarılır.
4. GPT parse boş/hatalı ise Python parser fallback devreye girer.
5. Her blok için metrik değerlendirmesi + overall analiz üretilir.

### 9.2 İki Katmanlı Parse Stratejisi

- **Ana yol:** GPT parser (esnek ifade yakalama).
- **Fallback:** Python parser (deterministik güvenlik ağı).

Bu yaklaşım gerçek soruların kaçırılmasını azaltırken sistemin tamamen GPT’ye bağımlı kalmamasını sağlar.

### 9.3 Meta Soru Tespiti

- Setup/closing örüntüleri meta olarak işaretlenir.
- Aynı cümlede gerçek soru varsa question bloğu korunur.
- Meta bloklar overall skora girmez (`excludedFromOverall=true`).

### 9.4 Soru-Cevap Değerlendirmesi (`analyze_single_qa_gpt`)

Her soru için tip + metrik seti atanır:
- relevance, clarity, depth zorunlu çekirdek metrikler,
- evidenceExample / technicalAccuracy bağlama göre aktif.

### 9.5 Soru Skoru Hesaplama (Deterministik)

Soru tipine göre ağırlık seti uygulanır ve tekil soru skoru hesaplanır.

### 9.6 Genel Analiz (`generate_overall_analysis_gpt`)

Toplu pattern analizi üretilir:
- güçlü tekrar eden davranışlar,
- geliştirme alanları,
- odak konular,
- uygulanabilir öneriler.

### 9.7 Genel Skor Weighting

Teknik ve problem çözme sorularına görece daha yüksek ağırlık verilir;
overall score weighted average ile çıkarılır.

---

## 10. Görüntü Analizi (`vision_analyzer.py`)

### 10.1 Canlı Frame Analizi (Bölüm 1)

Canlı görüşme sırasında frame’ler Node’dan Python’a gönderilir (`/analyze-frame`):
- yüz varlığı,
- bbox,
- eye count,
- detector metadata.

Detector stratejisi:
- primary: MediaPipe,
- fallback: OpenCV Haar.

### 10.2 Oturum Sonu LLM Raporu (Bölüm 2)

Session sonunda vision aggregate payload yorumlanır (`/analyze-vision`) ve:
- overall skor/etiket,
- posture/eye-contact/composure alt başlıkları,
- strengths/improvements/recommendations
üretilir.

---

## 11. Kalıcılık ve Dosya Arşivi

### 11.1 InMemory Depolama

- `InMemorySessionRepository`: aktif session runtime state.
- `InMemoryReportRepository`: ilk rapor snapshot’ı.

### 11.2 `FileReportArchive.js`

Diskte saklanan başlıca artifact’lar:
- `transcript.txt`
- `audio_segments.json`
- `audio_report.json`
- `transcript_report.json`
- `vision_frames.json`
- `vision_report.json`
- incremental candidate answer audio dosyaları

`loadFeedbackArtifacts(sessionId)` bu dosyaları toplayıp `ReportView` için normalize eder.

---

## 12. Feedback Ekranı (FeedbackPage)

UI 3 sekmeden oluşur:
1. Yanıt Analizi
2. Ses Analizi
3. Görüntü Analizi

Backend’den dönen `analysisStatus` alanı polling davranışını belirler.

Güncel kritik alanlar:
- `audio`
- `transcript`
- `vision`
- `visionLlm`
- `visionExpected`

`visionExpected=true` ise client vision LLM artifact’ını bekler; böylece vision sonucu geç yazıldığında polling erken bitmez.

---

## 13. Kullanılan Tüm Modeller / API'lar — Özet Tablosu

| Alan | Model/Servis | Nerede | Amaç |
|---|---|---|---|
| Realtime Interviewer | OpenAI Realtime (güncel preview sürümü) | Node | Canlı konuşma/mülakatçı akışı |
| Preview/Hints/Feedback | `gpt-4o-mini` | Node | Soru üretimi + supportive içerik |
| STT (candidate transcribe) | `gpt-4o-transcribe` (+ gerektiğinde `whisper-1`) | Node | Aday sesini transcript’e dönüştürme |
| Transcript değerlendirme | `gpt-4o-mini` | Python | QA sınıflandırma + metrik yorumu |
| Audio yorum katmanı | `gpt-4o-mini` | Python | Deterministik ses metriklerinin metinsel açıklaması |
| Vision yorum katmanı | `gpt-4o-mini` | Python | Görüntü performans raporu |
| Duygu modeli | `superb/wav2vec2-base-superb-er` | Python | Ses duygu dağılımı |
| Netlik modeli | `facebook/wav2vec2-base-960h` | Python | Netlik/intelligibility |
| Vision detector | MediaPipe + OpenCV fallback | Python | Canlı yüz/frame analizi |

---

## 14. Geliştirici Notları

### Kurulum ve Çalıştırma

**Python API:**
```bash
cd project/server/src/services/analysis/python_api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python api.py
```

**Node server:**
```bash
cd project/server
npm install
npm run dev
```

**Client:**
```bash
cd project/client
npm install
npm run dev
```

### Önemli Tasarım Kararları

1. **İlk rapor hızlı, detay rapor asenkron:** kullanıcı beklemeden feedback ekranına geçer; artifact’lar sonradan dolar.
2. **GPT-first + fallback parse:** transcript kalitesini artırırken servis kesintisine dayanıklılık sağlar.
3. **Artifact-centric tasarım:** tüm analiz sonuçları dosya tabanlı arşivde tutulur; yeniden yükleme/debug kolaylaşır.
4. **Vision readiness kontrolü:** UI polling erken bitmesin diye `visionExpected` sinyali kullanılır.
5. **Dolgu sözcük hassasiyeti:** token normalize + tekrar sıkıştırma ile `ııı/eee/şeeey/yanii` gibi varyasyonlar daha güvenilir yakalanır.
