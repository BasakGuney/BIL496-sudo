# Sistem Mimarisi ve Modül İşleyişi - Detaylı Teknik Doküman

Bu belge, projenin **uçtan uca nasıl çalıştığını**, her ana klasör ve modülün görevini, özellikle de **audio**, **vision**, **transcript**, **LLM yorumlama**, **rapor üretimi** ve **artifact akışını** detaylı şekilde anlatır.

---

# 1. Genel Mimari

Sistem 3 ana katmandan oluşur:

1. **Client (React + Vite)**
2. **Node.js Backend (Express + orchestration katmanı)**
3. **Python Analysis API (FastAPI + model inference + Ollama yorumları)**

Temel amaç:
- aday ile gerçek zamanlı sesli mülakat yapmak,
- transcript toplamak,
- adayın ses cevaplarını arşivlemek,
- görüntüden davranışsal sinyaller çıkarmak,
- ses/görüntü/metin verilerini ayrı ayrı analiz etmek,
- bunları son bir feedback ekranında göstermek.

---

# 2. Yüksek Seviye Veri Akışı

## 2.1 Mülakat başlamadan önce
- Kullanıcı setup ekranında bilgileri girer.
- Backend yeni bir session oluşturur.
- Session için benzersiz bir `S-...` id üretilir.

## 2.2 Mülakat sırasında
- Browser mikrofon ve kameraya bağlanır.
- Realtime ses bağlantısı OpenAI üzerinden yürür.
- Kamera kareleri belirli aralıklarla backend'e yollanır.
- Backend bu kareleri Python vision analiz sürecine verir.
- Realtime transcript ve candidate audio segmentleri tarayıcı tarafında tutulur.
- Candidate cevap sesleri aralıklı olarak backend'e incremental biçimde yüklenir.

## 2.3 Mülakat bittiğinde
- Transcript ve candidate audio listesi backend'e gönderilir.
- Backend raporun temel gövdesini üretir.
- Session klasörü altında artifact dosyalarını yazar.
- Python analysis client audio / transcript / vision analizlerini tetikler.
- Python tarafında model çıktıları ve LLM yorumları üretilir.
- Client hazır raporu polling ile bekler.
- Rapor hazır olduğunda feedback ekranı gösterilir.

---

# 3. Client Katmanı

## 3.1 `project/client/src/app`
Uygulamanın sayfa akışı burada toplanır.

### `App.tsx`
- route yönetir (`setup`, `preview`, `interview`, `feedback`)
- session id ve rapor state'ini taşır
- interview bitince feedback'e geçişi yönetir

## 3.2 `project/client/src/pages`

### `SetupPage.tsx`
- aday bilgilerini toplar
- backend'de session oluşturur

### `InterviewPage.tsx`
Bu sayfa canlı mülakat ekranıdır.

Sorumlulukları:
- realtime görüşmeyi başlatmak
- kamerayı açmak
- vision analyzer başlatmak
- incremental audio upload yapmak
- bitişte transcript + audio'yu backend'e göndermek
- rapor hazır olana kadar beklemek

### `FeedbackPage.tsx`
- backend'den gelen zenginleştirilmiş raporu gösterir
- audio skorları
- vision skorları
- transcript/vision/audio LLM panelleri
- birleşik öneriler
- skor açıklamaları

## 3.3 `project/client/src/lib`

### `realtimeClient.ts`
Bu dosya canlı mülakatın ses omurgasıdır.

Başlıca görevleri:
- WebRTC session oluşturmak
- OpenAI realtime ile sesli bağlantı kurmak
- transcript parçalarını toplamak
- candidate audio segmentlerini kaydetmek
- gerektiğinde bunları base64'e dönüştürmek

### `visionAnalysis.ts`
- browser kamerasından belirli aralıklarla frame alır
- frame'i JPEG/base64 olarak backend'e yollar
- supportive mode için overlay state üretir

### `api.ts`
- setup, endSession, getReport gibi REST çağrılarını yapar
- report hazır olana kadar polling yardımcıları içerir

### `types.ts`
- feedback rapor tipi
- vision analysis tipi
- score meta tipi
- transcript / audio / recommendation yapıları

---

# 4. Node.js Backend Katmanı


## 4.1 `project/server/src/domain`
Alan modelinin bulunduğu katmandır.

- `entities/`: Session, report gibi çekirdek iş nesneleri
- `enums/`: Session state, interview type gibi sabit kategoriler
- `errors/`: Uygulama seviyesinde anlamlı hata tipleri
- `value-objects/`: Session config, consent gibi kurallı veri paketleri

## 4.2 `project/server/src/dto`
API sınırındaki veri şekillerini tanımlar.

- `requests/`: dışarıdan gelen payload şekilleri
- `responses/`: dışarı dönen payload şekilleri
- `responses/views/`: client'a uygun görünüm nesneleri (`ReportView` gibi)

## 4.3 `project/server/src/persistence`
Kalıcılaştırma ve repository abstraction katmanıdır.

- `repositories/`: soyut repository arayüzleri
- `storage/`: bu arayüzlerin dosya/in-memory implementasyonları

## 4.4 `project/server/src/api`

### Controllers
- `SessionController`: session oluşturma / başlatma
- `ConsentController`: izin güncelleme
- `RealtimeController`: realtime offer/answer
- `ReportController`: report alma, session bitirme, vision frame ingest

### Routes
- `sessionRoutes.js`: tüm HTTP uçlarını toplar

## 4.5 `project/server/src/orchestration`

### `BackendOrchestrator.js`
Sistemin merkez koordinatörüdür.

Görevleri:
- session oluşturmak
- runtime state tutmak
- incremental audio merge etmek
- transcript merge etmek
- vision frame ingest etmek
- session sonunda rapor üretmek
- arşiv yazmak
- Python analysis client çağırmak
- getReport sırasında artifact'ları rapora eklemek

### Vision runtime state içinde tutulan başlıca alanlar
- `sampledFrames`
- `faceDetectedFrames`
- `totalFaceAreaRatio`
- `totalCenterOffset`
- `movementAccumulator`
- `warnFrames`
- `dangerFrames`
- `lowEyeFrames`
- `samples`

Bu alanlar final `visionAnalysis` çıktısına dönüştürülür.

## 4.6 `project/server/src/persistence/storage`

### `FileReportArchive.js`
Session klasörüne artifact yazan modüldür.

Yazdığı temel şeyler:
- `audio/answer_XX.webm`
- `vision/frame_XX.jpg`
- `transcript.txt`
- `vision_analysis_out.json`
- `audio_model_out.json`
- `audio_analysis_out.txt`
- `transcript_analysis_out.json`
- `vision_llm_analysis_out.json`

Ayrıca feedback ekranı için bu dosyaları tekrar okuyup `loadFeedbackArtifacts()` ile tek payload halinde döndürür.

## 4.7 `project/server/src/services/analysis`

### `PythonAnalysisClient.js`
Node tarafı ile Python API arasında köprüdür.

Görevleri:
- `.webm` → `.wav` dönüşümü yapmak (`ffmpeg-static`)
- `/analyze-session` çağırmak
- `/analyze-transcript` çağırmak
- `/analyze-vision` çağırmak
- servis kapalıysa graceful fallback sağlamak

### `VisionFrameAnalyzer.js`
- Node içinden Python script (`frame_face_analyzer.py`) çalıştırır
- frame bazlı bbox / faceCount / eyeCount / diagnostics çıktıları alır

### `VisionSignalProcessor.js`
`visionAnalysis` içinden üst seviye skorlar türetir.

Örnek skorlar:
- `focusScore`
- `facePresenceScore`
- `framingScore`
- `headMovementScore`
- `tensionScore`

### `SignalAggregator.js`
Audio + vision + transcript katmanlarından gelen sinyalleri tek rapor nesnesine çevirir.

### `BehaviorAnalyzer.js`
- transcript evaluator
- audio signal processor
- vision signal processor
çıktılarını birleştirerek son rapor gövdesini oluşturur.

### `TranscriptEvaluator.js`
Transcript içeriğinden:
- soru-cevap eşleşmeleri
- ilgililik
- netlik
- pacing
- öneriler
üretir.

OpenAI erişimi yoksa heuristic fallback üretir.

---

# 5. Python Analysis API Katmanı

Konum:

```text
project/server/src/services/analysis/python_api
```

## 5.1 `api.py`
FastAPI uygulamasıdır.

Endpoint'ler:
- `/analyze-session`
- `/analyze-transcript`
- `/analyze-vision`
- `/` health benzeri temel endpoint

## 5.2 `audio_analyzer.py`
Audio model inference ve Ollama yorumlarını içerir.

## 5.3 `transcript_llm_analyzer.py`
Transcript için LLM tabanlı JSON yapı üretir.

## 5.4 `frame_face_analyzer.py`
Tek frame üzerinden yüz/göz tespiti yapar.

Öncelik sırası:
1. MediaPipe
2. MediaPipe Tasks
3. OpenCV fallback

---

# 6. Audio İşleme Süreci

## 6.1 Audio veri kaynağı
Candidate konuşmaları browser tarafında segmentlenir ve backend'e gider.

## 6.2 Saklama
`audio/` altına cevap dosyaları yazılır.

## 6.3 Python'a gönderim
Node tarafı bunları WAV'a çevirir ve Python API'ye yollar.

## 6.4 Kullanılan modeller

### `superb/wav2vec2-base-superb-er`
Emotion recognition modeli.

Ürettiği temel emotion label'ları:
- `neu`
- `hap`
- `ang`
- `sad`

### `mpoyraz/wav2vec2-xls-r-300m-cv7-turkish`
Türkçe clarity analizi için kullanılır.

## 6.5 Audio metrikleri
Python tarafında bakılan başlıca metrikler:
- duration
- clarity
- emotions
- speech.wpm
- pause_ratio
- pure_speech_time

## 6.6 Audio LLM yorumu
Ham skorlar Ollama'ya gönderilir.

LLM şunları yapar:
- baskın duyguyu metinselleştirir
- özgüven / gerginlik dengesini yorumlar
- sert ton / coşku durumunu açıklar
- kariyer koçu tarzında rapor üretir

Çıktı dosyaları:
- `audio_model_out.json`
- `audio_analysis_out.txt`

---

# 7. Vision İşleme Süreci

## 7.1 Browser sampling
`visionAnalysis.ts` belirli aralıklarla video elementinden kare alır.

## 7.2 Backend ingest
Bu kareler şu route'a gider:
- `POST /session/:sessionId/vision/frame`

## 7.3 Python frame analizi
`frame_face_analyzer.py` şunlara bakar:
- yüz var mı?
- kaç yüz var?
- bounding box nedir?
- göz sayısı / göz görünürlüğü ne durumda?
- hangi detector kullanıldı?

## 7.4 Backend'te türetilen vision metrikleri
`BackendOrchestrator` frame sonuçlarını biriktirerek şu metrikleri üretir:

### Overview tarafı
- `sampledFrames`
- `faceDetectedFrames`
- `missingFaceFrames`
- `savedSampleCount`
- `facePresenceRatio`
- `facePresenceScore`
- `focusScore`
- `centeringScore`
- `steadinessScore`
- `averageFaceAreaRatio`
- `averageCenterOffset`
- `headMovementRaw`

### Tension tarafı
- `visualTensionScore`
- `attentionRiskScore`
- `movementRiskScore`
- `eyeTensionScore`
- `attentionDriftRatio`
- `dangerFrameRatio`
- `lowEyeRatio`
- `warnFrames`
- `dangerFrames`
- `lowEyeFrames`

## 7.5 Vision sample seçimi
Her frame kalıcı tutulmaz.
Sistem daha çok:
- attention değişimi
- önemli kadraj kayması
- face count değişimi
- belirgin merkez/alan farkı
- önemli anlar
üzerine sample seçer.

Seçilen sample'lar `vision/` altında JPEG olarak yazılır.

## 7.6 Vision LLM yorumu
`vision_analysis_out.json` içindeki sayısal alanlar Ollama'ya gider.

LLM şu tür çıktılar üretir:
- kısa özet
- camera presence / framing / stability / stress skor yorumları
- güçlü yanlar
- riskler
- öneriler

Çıktı dosyası:
- `vision_llm_analysis_out.json`

---

# 8. Transcript İşleme Süreci

## 8.1 Transcript kaynağı
Realtime session sırasında aday ve interviewer tarafı transcript olarak toplanır.

## 8.2 Soru-cevap eşleşmesi
`TranscriptEvaluator` transcript'ten Q/A çiftleri çıkarır.

## 8.3 Heuristic metrikler
- relevance
- clarity
- durationSec
- timeLimitSec
- exceededTimeLimit
- pacingScore

## 8.4 LLM transcript yorumu
Python tarafındaki `transcript_llm_analyzer.py`, transcript ve qaPairs verisini Ollama'ya yollar.

Beklenen yapılandırılmış çıktı:
- `overallScore`
- `content`
- `communication`
- `recommendations`
- `qaEvaluations`

Çıktı dosyası:
- `transcript_analysis_out.json`

---

# 9. Feedback Ekranına Veri Nasıl Gidiyor?

1. Backend session report nesnesini üretir.
2. `FileReportArchive` artifact dosyalarını session klasörüne yazar.
3. Python API ek artifact'ları üretir.
4. `getReport()` çağrısında backend bu artifact'ları tekrar okuyup tek bir `ReportView` payload'ına dönüştürür.
5. Client bu payload içinde şunları görür:
   - `visionAnalysis`
   - `audioAnalysis`
   - `transcriptAnalysis`
   - `visionLlmAnalysis`
   - `scoreMeta`
   - `analysisStatus`
6. `FeedbackPage` bunları kutular ve skor kartları halinde gösterir.

---

# 10. Klasör Bazında İşlevler

## `project/client`
Kullanıcı arayüzü.

## `project/server`
Node backend, orchestration, realtime ve report API katmanı.

## `project/server/src/api`
HTTP endpoint yönetimi.

## `project/server/src/orchestration`
Akış koordinasyonu.

## `project/server/src/services/analysis`
Audio / vision / transcript analiz köprüleri.

## `project/server/src/services/analysis/python_api`
Model inference + LLM yorumlama + FastAPI.

## `project/server/src/persistence/storage`
Session artifact arşivi ve in-memory repository'ler.

## `project/server/reports`
Her oturumun kalıcı çıktıları.

## `scripts`
Kurulum / çalıştırma kolaylaştırma scriptleri.

---

# 11. Sonuç

Bu proje klasik bir CRUD uygulaması değildir; gerçek zamanlı sesli görüşme, frame tabanlı vision analizi, offline/yerel LLM yorumları, transcript analizi ve arşivlenmiş artifact'ların tek bir feedback ekranında birleştirilmesi üzerine kurulmuş çok katmanlı bir sistemdir.

Özellikle kritik akış şudur:

**Browser → Node realtime/backend → Python model analizi → Ollama yorumları → Node report view → React feedback ekranı**

Bu yüzden kurulum sırasında:
- Python 3.12
- Node.js
- Ollama + `llama3.1`
- OpenAI API key

olmadan sistem tam kapasite çalışmaz.
