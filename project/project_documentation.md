# Sudo-Interview AI Projesi: Genel Mimari ve Çalışma Mantığı

Bu döküman, projenin yapısını, temel modüllerini, teknik gereksinimlerini ve bilgisayarınızda nasıl çalıştıracağınızı açıklamaktadır.

---

## 🏗️ 1. Proje Mimarisi (Genel Bakış)

Proje modern **İstemci-Sunucu (Client-Server)** mimarisiyle inşa edilmiştir.
Arayüz (Client), kullanıcının kamerası ve mikrofonu ile etkileşime girdiği noktadır. Arka plan (Server) ise OpenAI'ın **Realtime API** altyapısıyla şifreli WebSocket bağlantıları kurarak konuşmayı sese, sesi analize çeviren köprü görevi görür.

### Temel Veri Akışı (Mülakat Süreci)
1. **Oda Kurulumu:** Aday özelliklerini (rol, alan, tür) seçer ve "Mülakata Başla" der. İstemci sunucudan bir Session ID (`S-XXXXX`) alır.
2. **WebRTC Bağlantısı:** İstemci, sunucunun `/realtime/offer` endpoint'i üzerinden SDP paketlerini değiştirerek WebRTC bağlantısı kurar. 
3. **Gerçek Zamanlı İletişim:** O sırada WebRTC'de bir mikrofon yayını (audio track) açılır. Sunucu bu yayını alır, OpenAI Realtime API'ye iletir. AI sesi işler ve karşı tarafa anında kendi sentezlenmiş sesiyle geri döner (`model="gpt-realtime-mini"`, ses: `marin`).
4. **Tool Çağrıları & Transkript:** Aday konuştukça ses metne dökülür (transkript). AI ayrıca içeride süre takibi yapar.
5. **Bitirme & Raporlama:** "Bitir" dendiğinde istemci WebRTC soketini kapatır, transkripti ve adayın kaydedilen ses parçalarını sunucuya `/report` ucundan POSTlar. Sunucu raporu hesaplar ve sonuçları JSON olarak kaydeder.

---

## 📂 2. Backend (Sunucu) Modülleri ve Sorumlulukları

Arka plan projesi **Node.js** ve **Express** üzerine kuruludur. `/server` klasöründe yer alır.

*   `server/AppServer.js`: Tüm Express sunucusunun, rote'ların ve hata yakalama (error handler) mekanizmalarının başlatıldığı **ana çatıdır**.
*   `api/routes/sessionRoutes.js`: Dışarıya açılan kapıdır. Yeni oturum yaratma, WebRTC teklifini yönetme, sonuçları kaydetme gibi `/session` ve `/realtime` uçlarını (endpoint) tanımlar.
*   **Services (Servisler - İş mantığının kalbi):**
    *   `services/realtime/RealtimeManager.js`: İstemci ile WebRTC tünelini açar. Aynı zamanda OpenAI tarafına güvenli WebSocket tüneli açar ve bu iki bağımsız dünyayı birbirine bağlar.
    *   `services/realtime/SessionUpdateBuilder.js`: OpenAI tarafına AI'a özel konfigürasyonları (hangi model kullanılacak, ses tonu, ses tanıma ayarları) iletir.
    *   `services/ai/PromptTemplates.js`: AI'ın ana beynidir. AI'ın vereceği tepkiler, mülakat davranışları (Human Resources / Technical), kopya verme stratejileri (Supportive/Neutral) tamamen bu dosyadan yönetilir.
*   **Persistence (Kayıt):**
    *   `persistence/storage/FileReportArchive.js`: Mülakat bitince oluşan sonucu `reports/{SessionID}` klasörüne asenkron olarak yazar. Ayrıca adayın ses kayıtlarını base64'ten çözerek `answer_01.webm` formatıyla klasörler.
*   **Orchestration:**
    *   `orchestration/BackendOrchestrator.js`: Yukarıdaki tüm alt servisleri (Controller, AI, Database vb.) tek çatı altında toplayan yöneticidir. Karmaşayı engeller.

---

## 💻 3. Frontend (İstemci) Modülleri ve Sorumlulukları

Ön yüz **React (Vite)** ile geliştirilmiş olup, hız odaklı **TypeScript** kullanmaktadır. Tasarım sistemi için modern **TailwindCSS** ve **Radix UI** parçaları kullanılmıştır.

*   `src/pages/InterviewPage.tsx`: Mülakatın gerçekleştirildiği asıl sayfadır.
    *   Web kamerası (PiP) bağlantısını kurar.
    *   `FinishingGuard` mekanizmaları ile asenkron hataları önler, sayfadan aniden çıkılmasını güvenli hale getirir.
    *   Arayüzdeki ses dalgalarını (VoiceWaveCanvas) hareket ettirir.
*   `src/lib/realtimeClient.ts`: Ön yüzün sessiz kahramanıdır.
    *   `RTCPeerConnection` oluşturarak STUN/TURN sunucuları üzerinden WebRTC protokolünü başlatır.
    *   Mikrofondan gelen sesi kanala (MediaStream Track) basar. Aynı zamanda OpenAI'dan dönen sesi tarayıcıya çaldırır.
    *   OpenAI'dan dönen canlı metinleri (transkript) satır satır yakalar ve kaydeder.
    *   Adayın konuştuklarını MediaRecorder ile parçalara (Blob) ayırıp base64 formatında sunucuya hazırlar.

---

## 🚀 4. Kullanım ve Kurulum Rehberi

Projeyi kendi ortamınızda (lokalde) çalıştırmak için izlemeniz gereken adımlar:

### Gereksinimler
*   **Node.js**: (Tavsiye edilen v18 veya v20 LTS)
*   **Python**: (v3.10 veya üzeri tavsiye edilir)
*   **Ollama**: Yerel yapay zeka analizleri için (Llama3 modeli kullanımı için). [ollama.com](https://ollama.com/) adresinden indirin.
*   **Geçerli bir OpenAI API Key** (Realtime API yetkisi açık olmalı).

---

### 1. Ortam (Environment) Ayarları
`server/` dizini içinde bir `.env` dosyası oluşturmalısınız:
```env
PORT=3001
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 2. Otomatik Kurulum (Her Şeyi Tek Seferde Yükleme)
Proje klasörleri içindeki Node.js paketlerini, Python sanal ortamını (venv), Python kütüphanelerini ve Ollama (Llama3) modelini tek tuşla kurmak için Windows sistemlerinde PowerShell betiği kullanabilirsiniz.

1. Projenin ana (kök) klasöründe bir Terminal/PowerShell açın.
2. Aşağıdaki komutu çalıştırın:
   ```powershell
   .\setup.ps1
   ```
   *(Eğer yetki hatası alırsanız, önce `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` yazıp enter'a basın ve komutu tekrar deneyin.)*

Bu script bittikten sonra projedeki tüm gerekli altyapılar kurulmuş ve modeller inmiş olacaktır.

---

### 3. Sunucuyu ve Arayüzü Başlatma

Kurulumlar bittikten sonra projeyi ayaklandırmak için 3 ayrı terminal sekmesine ihtiyacınız var.

**Terminal 1 (Python Analiz Sunucusu):**
```bash
cd server\src\services\analysis\python_api
.\venv\Scripts\activate
uvicorn api:app --reload --port 8000
```

**Terminal 2 (Node.js Ana Sunucusu):**
```bash
cd server
npm run dev
```

**Terminal 3 (React Arayüzü):**
```bash
cd client
npm run dev
```

---

### 4. Arayüzü (Frontend) Başlatma
1. Terminalde yeni bir sekme açın ve `client` klasörüne gidin: `cd client`
2. Paketleri yükleyin: `npm install`
3. Arayüzü çalıştırın: `npm run dev`
*(Genelde http://localhost:5173 adresinde açılır)*

Sayfayı tarayıcıda açtığınızda mülakat ayarlarınızı girerek simulasyonları test etmeye başlayabilirsiniz.

### Kullanılan Ana Paketler
**Sunucu (Server):**
*   `express` (Web API oluşturma)
*   `cors` (Tarayıcı güvenlik önlemlerini yönetme)
*   `dotenv` (Gizli anahtarları okuma)

**İstemci (Client):**
*   `react`, `react-dom` (Arayüz iskeleti)
*   `vite` (Hızlı derleyici)
*   `tailwindcss` (Görsel şekillendirme / stil)
*   `lucide-react` (İkon asistanı)
*   `framer-motion` (Mikro animasyonlar)
*   `@radix-ui/*` (Erişilebilir komponent tabanı - Dropdown, Dialog, Progress)
