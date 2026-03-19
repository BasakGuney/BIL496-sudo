# 🏗️ Mülakat Sistemi - Kapsamlı Mimari ve İşleyiş Raporu

Sistem genel olarak **3 ana katmandan** (Client, Node.js Server, Python API) oluşmaktadır. Bu üç katman; yapay zeka destekli, gerçek zamanlı ve sesli bir mülakatı baştan sona yönetebilmek için birbiriyle senkronize çalışır.

## 1. Katmanlar ve Klasör Yapıları

### 💻 A. İstemci (Client - React / Vite)
Kullanıcının (Adayın) etkileşime girdiği önyüzdür. React tabanlı SPA (Single Page Application) olarak tasarlanmıştır.

* **Klasör Yapısı (`client/src/`):**
  * `app/`: Uygulamanın genel state (durum) yönetimi ve store mantığının tutulduğu yer.
  * `pages/`: Sayfa bazlı UI ve yönlendirme (Setup, Interview, Feedback) bileşenleri.
  * `components/`: Tekrar kullanılabilir arayüz parçaları (Butonlar, Kartlar, VoiceWaveCanvas).
  * `lib/`: Yardımcı araçlar. Özellikle **`realtimeClient.ts`** burada bulunur.
* **Sorumluluklar:**
  * **Ses Yakalama & Çalma:** Tarayıcının mikrofonuna erişir (`getUserMedia`), kullanıcının ses parçalarını yakalar ve WebRTC üzerinden oynatılacak yapay zeka sesini anlık olarak çalar.
  * **WebRTC İletişimi (`lib/realtimeClient.ts`):** Gecikmesiz karşılıklı konuşma (low-latency) için Node.js üzerinden OpenAI'a doğrudan ses köprüsü (SDP) kurar.
  * **Arayüz (UI):** Soruların ekrandaki durumunu, geri sayımı, izinleri ve mülakat sonrasında üretilen final raporunu (grafikler vs.) kullanıcıya sunar.

### ⚙️ B. Ana Sunucu (Node.js - Express)
Sistemin beyni ve güvenlik duvarıdır. Klasör mimarisi "Domain-Driven Design (Alan Odaklı Tasarım)" prensiplerine yakın şekilde parçalanmıştır:

* **`/src/api`**: Dış dünyaya açılan (React'tan gelen) HTTP(S) ve CORS isteklerini karşılayan Router ve Controller sınıflarını (Session, Consent, Report) barındırır.
* **`/src/config`**: Projenin gizli şifrelerini (OpenAI anahtarları vb.) barındıran Çevresel Değişken (Environment) yönetimini sağlar.
* **`/src/domain`**: İş mantığını tanımlar. Mülakat durumu (`SessionState`), ayarlar (`SessionConfig`) gibi ana "Data Class" tanımlılıkları buradadır.
* **`/src/orchestration`**: Uygulamanın en hayati klasörüdür. 
   * **`BackendOrchestrator.js`**: Tüm süreçlerin yöneticisidir. Bir mülakatın başlama-bitme evrelerini koordine eder, raporları tetikler ve alt sistemlere görev dağıtır.
   * **`GuardrailsEngine.js`**: İşlem sırasındaki izin kontrolleri (Consent) ve yetki doğrulamalarını yapar.
* **`/src/persistence/storage`**: Veritabanı veya Dosya Sistemi kayıtları.
   * **`FileReportArchive.js`**: Mülakat sırasındaki soru-cevap metinlerini, adayın verdiği `.webm` uzantılı ses cevap dosyalarını eşleştirip `/reports` klasörüne hiyerarşik olarak yazar.
* **`/src/services`**: Dış araçlarla konuşan veya spesifik bir işi yapan servisler.
   * **`/ai`**: OpenAI ile REST uç noktalarından (Gateway) haberleşen araçlar.
   * **`/analysis`**: Mülakatın analiziyle ilgilenen sınıflar. **`PythonAnalysisClient.js`** burada bulunur ve Python API ile iletişime geçer (ayrıca `.webm` dosyalarını `ffmpeg-static` ile `.wav`a dönüştürür).
   * **`/realtime`**: OpenAI'ın yeni duyurduğu "Realtime" WebRTC ses modeliyle anlık bağlantı (SessionManager) kuran WebSocket/SDP köprüleri.

### 🐍 C. Analiz Sunucusu (Python API - FastAPI)
Adayın mülakatı bittikten sonra "Derinlemesine Analiz" yapan lokal zeka katmanıdır.

* **`/python_api` Klasörü:**
   * **`api.py` (FastAPI)**: Dışarıya `/analyze-session` ve `/analyze-transcript` adında iki uç nokta (endpoint) sunar. 
   * **`analyzer.py`**: Model ağırlıklarını belleğe yükleyen ve Node.js'ten gelen WAV dosyalarını milisaniyeler içinde işleyen çekirdek analitik fonksiyonlarını içerir.
   * **`transcript_analyzer.py`**: Adayın konuşma metni (`transcript`) üzerinden içeriksel (semantik) zeka analizini yapar. Diğer yapay zeka Llama modelleriyle bağlantı kurar.

---

## 2. Kullanılan Yapay Zeka (AI) Modelleri ve İşlevleri

Sistem birden fazla yapay zekanın "Orkestrasyonu (Birbirini Yönetmesi)" üzerine kuruludur:

1. **`gpt-4o-realtime` (OpenAI)**
   * **Rolü:** Canlı İnsan Kaynakları Uzmanı (Görüşmeci / Sesli Zeka).
   * **Bulunduğu Yer:** Node.js üzerinden (`/src/services/realtime` altındaki köprüler vasıtasıyla) kullanılır.
   * **İşlevi:** Adayın sesini doğrudan dinler, anlar ve **milisaniyeler içerisinde kendi sesiyle Türkçe yanıt verir.** Gecikmesiz sesli diyalog bu modelle sağlanır. Kendi bağlamı (hafızası) vardır, mülakat senaryosunu (HR Promptlarını) takip ederek adaya spesifik sorular sorar.

2. **`gpt-4o-mini-transcribe` (OpenAI)**
   * **Rolü:** Konuşmayı Yazıya Dökme (Speech-to-Text).
   * **Bulunduğu Yer:** Node.js (`CandidateAudioTranscriber.js`).
   * **İşlevi:** Mülakat sırasında adayın verdiği cevapları saf sesten alıp Türkçe/İngilizce terim karmaşası olmadan yüksek doğrulukta yazıya döker (Transcript).

3. **`superb/wav2vec2-base-superb-er` (Hugging Face)**
   * **Rolü:** Sesli Duygu Tanıma (Speech Emotion Recognition - SER).
   * **Bulunduğu Yer:** Python API (`analyzer.py`).
   * **İşlevi:** Wav2Vec2 tabanlı bu model, adayın "kelimelerine" değil, doğrudan "ses dalgalarına (frekans ve tınılarına)" odaklanır. Adayın sesindeki titremeleri veya ton farklılıklarını inceleyerek; **Özgüven (Neu), Coşku (Hap), Gerginlik (Sad), Sert Ton (Ang)** olmak üzere 4 ana duygu durumunu yüzdelik olasılıklarla çıkarır.

4. **`mpoyraz/wav2vec2-xls-r-300m-cv7-turkish` (Hugging Face)**
   * **Rolü:** Özel Türkçe Ses Netliği (Clarity) Analizi.
   * **Bulunduğu Yer:** Python API (`analyzer.py`).
   * **İşlevi:** Türkçe için özel eğitilmiş (Fine-tuned) bu model, adayın harfleri ne kadar net yuttuğunu veya vurguları ne kadar doğru yaptığını (Diksiyon/Clarity) ölçer. Bir kelimenin ses dalgasıyla, beklenen harf dizilimini modelin kendi içindeki çıktılarıyla eşleştirip güven (confidence) skoru üretir.

5. **`llama3.1` (Veya Çalışan Ollama Modeli)**
   * **Rolü:** İnsan Kaynakları Analisti / HR Stratejisti.
   * **Bulunduğu Yer:** Python API (`transcript_analyzer.py` ve `analyzer.py` içindeki Ollama entegrasyonu).
   * **İşlevi:** Yerel (offline) çalışan bir Büyük Dil Modelidir (LLM). İki şekilde çalışır:
     * **Ses Yorumlayıcı:** `wav2vec2` modellerinden dönen "Özgüven: %60, Gerginlik: %40" gibi ham sayısal verileri okur; "*Adayın başlangıçta gergin olduğu, ancak daha sonra özgüveninin yerine geldiği görülmektedir*" şeklinde metinsel bir sentez yazısı yazar.
     * **İçerik Yorumlayıcı:** Adayın yazıya dökülen cevaplarını, İK kurallarına göre okuyarak "*Kendini tanıtma sorusuna kısa ve doğrudan bir giriş yaptın.*" şeklinde halüsinasyonsuz, detaylı ve mantıksal geri bildirim metinleri (coach report) üretir. 

---

## 3. Adım Adım İşleyiş Akışı (Pipeline)

Sistemin donanım sınırlarına takılmaması ve asenkron (kullanıcıyı bekletmeyen) çalışabilmesi için akış belirli bir hiyerarşide dizayn edilmiştir:

1. **İletişimin Kurulması:**
   React (İstemci) `/session` isteğini attığında, *BackendOrchestrator* oturumu oluşturur ve *RealtimeSessionManager* **`gpt-4o-realtime`** modeline WebRTC ses köprüsüyle bağlanır.
2. **Canlı Mülakat ve Veri Toplama:**
   Model adaya sorular sorar. Aday cevap verdikçe *(Örn: Soru 1, Soru 2)* her cevap React tarafında bir **WebM ses dosyası** olarak yakalanır ve anlık olarak Node.js belleğine post edilir.
3. **Mülakatın Kapanışı ve Döküm (Transkripsiyon):**
   Mülakat bittiği an, hafızada birikmiş bu sesler **`gpt-4o-mini-transcribe`** ile yazıya dökülür ve *FileReportArchive* tarafından `reports/S-...` klasörüne hiyerarşik bir formatta kalıcı (*save*) edilir. 
   *(Bu aşamada React tarafına "Mülakat Bitti, Rapor Hazırlanıyor" sinyali dönülür ki aday ekranda bekletilmesin).*
4. **Veri Dönüştürme:**
   *BackendOrchestrator*, verilerin yazımı biter bitmez derhal **`PythonAnalysisClient`**'ı ateşler. Bu modül `ffmpeg-static` aracıyla az önce oluşturulan tüm `.webm` ses dosyalarını `.wav` (Monomoral 16kHz) formatına dönüştürür çünkü Hugging Face modelleri bunu gerektirir.
5. **Derin Zeka ile Analiz ve Raporlama (Python API İşlemi):**
   * *Aşama A:* Dönüştürülen dosyalar Python API'ye (`/analyze-session`) gönderilir. **Wav2Vec2** modelleri (ilk çalışmada otomatik indirilir) tüm sorular için ses/duygusal metrikleri çıkarır. **Llama** (Ollama üzerinden lokal çalışır, önceden indirilmiş olmalıdır) modeli bu metrikleri sayısal değerlerden paragraflara çevirir (`audio_analysis_out.txt`).
   * *Aşama B:* Mülakatın yazılı dökümü Python API'ye (`/analyze-transcript`) gönderilir. **Llama** modeli cevapların semantik/mantıksal doğruluğunu denetler ve kapsamlı bir koçluk önerisi sunar (`transcript_analysis_out.json`).
6. **Sonuç:**
   Python API çalıştığı klasördeki ( `reports/S-...` ) tüm JSON ve TXT dosyalarını doğrudan diske yazar. Analiz sistemi bağımsız tamamlandığı an, tüm İK dökümanları yetkilinin inceleyebileceği veya React ekranında okunabileceği son haline kavuşmuş olur.

---

## 4. Kurulum ve Çalıştırma Notları

Bu 3 katmanlı yapıyı ayağa kaldırmak için gereken **Node.js paketleri (Server & Client), Python kütüphaneleri (venv) ve Ollama modelleri** tek bir script ile otomatik kurulabilir.

Projenin ana klasöründe terminal üzerinden şu komutu çalıştırmanız yeterlidir:
```powershell
.\setup.ps1
```

Bu script çalıştığında tüm bağımlılıkları yükler, ffmpeg dosyalarını getirir, python sanal ortamını yaratıp kütüphaneleri çeker ve arka planda güncel Llama3.1 modelini (eski llama3 yerine) bilgisayarınıza indirir veya günceller.

Çalıştırma komutları (uvicorn, npm run dev vb.) ve diğer detaylar için `project_documentation.md` dosyasına bakabilirsiniz.
