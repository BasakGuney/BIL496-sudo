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

Bu bölüm iki katmanda hazırlanmıştır:
1. **Proje kök klasörlerinin kısa işlev özeti**
2. **`server/src` altındaki tüm klasör ve dosyaların detaylı işlev listesi**

### 2.1 Proje Kök Klasörleri (Kısa Özet)

| Klasör | Kısa İşlev |
|---|---|
| `project/client` | React + Vite arayüzü (setup, preview, interview, feedback ekranları). |
| `project/server` | Node.js API, realtime orkestrasyon, analiz entegrasyonları ve rapor üretimi. |
| `project/docs` | Mimari/teknik dökümantasyon dosyaları. |
| `project/reports` | Session bazlı artifact arşivi (`S-...` dizinleri, transcript/audio/vision çıktıları). |

### 2.2 `server/src` — Klasör Bazında Detay

| Klasör | İşlev |
|---|---|
| `api` | HTTP controller, route ve middleware katmanı. |
| `config` | Ortam değişkenleri ve konfigürasyon okuma. |
| `domain` | Entity, enum, value-object ve domain error tanımları. |
| `dto` | Request/response görünüm eşlemeleri (View modelleri). |
| `orchestration` | Session lifecycle ve iş akışı koordinasyonu. |
| `persistence` | In-memory repository’ler ve file archive katmanı. |
| `services/ai` | OpenAI entegrasyonu, prompt şablonları ve gateway işlemleri. |
| `services/analysis` | Transcript/audio/vision analiz adaptörleri ve sinyal işlem katmanı. |
| `services/analysis/python_api` | Python FastAPI analiz servisi ve model tabanlı hesaplamalar. |
| `services/realtime` | Realtime oturum update, VAD ve session manager bileşenleri. |
| `utils` | Yardımcı sınıflar (`IdGenerator`, `Logger`). |

### 2.3 `server/src` — Tüm Dosyalar ve Kısa İşlevleri

#### 2.3.1 Kök

| Dosya | İşlev |
|---|---|
| `AppServer.js` | Uygulamanın composition root’u; dependency wiring, router mount ve server listen işlemleri. |

#### 2.3.2 `api/`

| Dosya | İşlev |
|---|---|
| `api/controllers/SessionController.js` | Session create/start + preview/hints/feedback endpoint işlemleri. |
| `api/controllers/ConsentController.js` | Consent update endpoint’ini domain katmanına taşır. |
| `api/controllers/RealtimeController.js` | Realtime SDP offer/answer akışını yönetir. |
| `api/controllers/ReportController.js` | Answer/frame ingestion, end session ve report retrieval endpoint’leri. |
| `api/middleware/ErrorHandlerMiddleware.js` | Uygulama geneli error mapping ve HTTP hata cevabı standardizasyonu. |
| `api/routes/sessionRoutes.js` | Session/realtime/report route haritası ve endpoint bağlama noktası. |

#### 2.3.3 `config/`

| Dosya | İşlev |
|---|---|
| `config/env.js` | Ortam değişkenlerini (port, API key, reports path vb.) normalize eder. |

#### 2.3.4 `domain/`

| Dosya | İşlev |
|---|---|
| `domain/entities/InterviewSession.js` | Session’ın temel domain modeli ve state transition davranışları. |
| `domain/entities/FeedbackReport.js` | Üretilen rapor verisinin domain temsili. |
| `domain/enums/InterviewType.js` | Interview tip sabitleri (HR/Technical). |
| `domain/enums/SessionMode.js` | Mod tanımları (ör. supportive/neutral). |
| `domain/enums/SessionState.js` | Session state sabitleri (configured, active, completed vb.). |
| `domain/errors/AppError.js` | Kod + statusCode taşıyan standart uygulama hatası. |
| `domain/value-objects/SessionConfig.js` | Session konfigürasyon değer nesnesi (role, difficulty, mode vb.). |
| `domain/value-objects/Consent.js` | Mikrofon/kamera onayı için value object doğrulaması. |

#### 2.3.5 `dto/`

| Dosya | İşlev |
|---|---|
| `dto/requests/CreateSessionRequest.js` | Create session istek gövdesi normalizasyon/doğrulama yapısı. |
| `dto/requests/StartSessionRequest.js` | Start session isteği için request modelleme. |
| `dto/requests/UpdateConsentRequest.js` | Consent update request modelleme. |
| `dto/responses/views/SessionView.js` | Session domain modelini API response görünümüne dönüştürür. |
| `dto/responses/views/SessionConfigView.js` | Session config alanlarını istemciye uygun görünümde sunar. |
| `dto/responses/views/ConsentView.js` | Consent bilgisinin response sunumu. |
| `dto/responses/views/SdpAnswerView.js` | Realtime SDP answer payload görünümü. |
| `dto/responses/views/TurnView.js` | Turn bazlı response alanlarının görünüm adaptörü. |
| `dto/responses/views/EvidenceItemView.js` | Evidence öğelerinin API response formatı. |
| `dto/responses/views/ReportView.js` | Rapor + feedback artifacts + analysisStatus alanlarını birleştirerek döner. |

#### 2.3.6 `orchestration/`

| Dosya | İşlev |
|---|---|
| `orchestration/BackendOrchestrator.js` | Ana orkestratör; session lifecycle, incremental audio/vision runtime, endSession pipeline. |
| `orchestration/GuardrailsEngine.js` | Consent/state kurallarını enforce eden guardrail katmanı. |
| `orchestration/InterviewFlowPolicy.js` | Mülakat akış kurallarını ve izinli geçişleri tanımlar. |

#### 2.3.7 `persistence/`

| Dosya | İşlev |
|---|---|
| `persistence/repositories/ISessionRepository.js` | Session repository sözleşmesi. |
| `persistence/repositories/IReportRepository.js` | Report repository sözleşmesi. |
| `persistence/storage/InMemorySessionRepository.js` | Bellek içi session saklama ve erişim. |
| `persistence/storage/InMemoryReportRepository.js` | Bellek içi report saklama ve erişim. |
| `persistence/storage/FileReportArchive.js` | Disk artifact yazma/okuma; transcript/audio/vision çıktılarının arşivlenmesi. |

#### 2.3.8 `services/ai/`

| Dosya | İşlev |
|---|---|
| `services/ai/AIServiceGateway.js` | Preview soru üretimi, live hints/feedback ve AI çağrı orkestrasyonu. |
| `services/ai/OpenAIClientAdapter.js` | OpenAI istemci çağrılarını tek bir adaptör altında toplar. |
| `services/ai/OpenAiRealtimeGateway.js` | Realtime offer/answer exchange işlemlerini yürütür. |
| `services/ai/PromptTemplates.js` | Interviewer/system prompt şablonları ve kural metinleri. |

#### 2.3.9 `services/analysis/`

| Dosya | İşlev |
|---|---|
| `services/analysis/BehaviorAnalyzer.js` | Transcript/vision sinyallerini birleştirip ana rapor üretimini tetikler. |
| `services/analysis/TranscriptEvaluator.js` | QA çıkarımı, heuristik değerlendirme ve LLM destekli transcript raporlama. |
| `services/analysis/TranscriptSignalProcessor.js` | Transcript’ten filler ratio gibi temel sinyal metrikleri çıkarır. |
| `services/analysis/VisionSignalProcessor.js` | Vision payload’ından aggregate davranış metrikleri üretir. |
| `services/analysis/InterviewSignalAggregator.js` | Farklı sinyal kaynaklarını tek rapor modelinde birleştirir. |
| `services/analysis/CandidateAudioTranscriber.js` | Candidate answer audio’larını STT ile metne dönüştürür (primary + fallback model). |
| `services/analysis/PythonAnalysisClient.js` | Node → Python API köprüsü; audio/transcript/vision çağrıları ve WAV dönüşümü. |
| `services/analysis/VisionFrameAnalyzer.js` | Canlı frame’leri Python frame endpoint’ine gönderip sonuçları normalize eder. |

#### 2.3.10 `services/analysis/python_api/`

| Dosya | İşlev |
|---|---|
| `services/analysis/python_api/api.py` | FastAPI servis giriş noktası ve HTTP endpoint tanımları. |
| `services/analysis/python_api/audio_analyzer.py` | Ses segment analizi, overall hesaplama ve ses LLM raporu. |
| `services/analysis/python_api/transcript_analyzer.py` | Transcript parse/sınıflandırma, soru bazlı metrik ve overall analiz üretimi. |
| `services/analysis/python_api/vision_analyzer.py` | Frame-level inference yardımcıları + vision final raporu yorumlama. |
| `services/analysis/python_api/requirements.txt` | Python analiz servisinin bağımlılık listesi. |

#### 2.3.11 `services/realtime/`

| Dosya | İşlev |
|---|---|
| `services/realtime/RealtimeSessionManager.js` | Realtime session create/update/offer-answer yönetimi. |
| `services/realtime/SessionUpdateBuilder.js` | Realtime `session.update` payload’larını oluşturur. |
| `services/realtime/TurnDetectionPolicy.js` | Turn detection (VAD) parametre politikasını belirler. |

#### 2.3.12 `utils/`

| Dosya | İşlev |
|---|---|
| `utils/IdGenerator.js` | Session ve benzeri kimliklerin üretimi. |
| `utils/Logger.js` | Standart log arayüzü ve log seviyeleri. |

### 2.4 `reports/` Arşiv Yapısı (Kısa)

`reports/S-<sessionId>/` altında tipik artifact’lar:
- `transcript.txt`
- `audio_segments.json`
- `audio_report.json`
- `transcript_report.json`
- `vision_frames.json`
- `vision_report.json`
- incremental candidate answer audio dosyaları

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
