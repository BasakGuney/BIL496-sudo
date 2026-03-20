# Windows Kurulum ve Çalıştırma Rehberi

Bu dosya, projeyi **Windows üzerinde sıfırdan** kurup çalıştırmak için gereken her şeyi anlatır.

> Bu rehberdeki örnek path şu klasörü baz alır:
>
> `C:\Users\basak\BIL496-sudo`
>
> Projeyi başka bir yere indirdiysen, komutlardaki path'i kendi klasörüne göre değiştir.

---

## 1. Gerekli Kurulumlar

Projeyi çalıştırmak için aşağıdaki bileşenler gereklidir:

### 1.1 Node.js
- **Gerekli sürüm:** Node.js LTS (18+; tercihen güncel LTS)
- **Ne için gerekli?**
  - `project/server` içindeki Node.js backend
  - `project/client` içindeki React/Vite frontend
- **Yaklaşık indirme boyutu:** ~30-40 MB installer, kurulum sonrası daha fazla disk alanı kullanır.
- **Nasıl indirilir?**
  - Resmi site: https://nodejs.org/
  - veya Windows Package Manager ile:
    ```powershell
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    ```

### 1.2 Python 3.12
- **Gerekli sürüm:** **Python 3.12**
- **Neden özellikle 3.12?**
  - Vision tarafında kullanılan `mediapipe` için bu proje özelinde hedef sürüm olarak **Python 3.12** kabul edilmiştir.
- **Yaklaşık indirme boyutu:** ~25-35 MB installer.
- **Nasıl indirilir?**
  - Resmi site: https://www.python.org/downloads/release/python-3120/
  - veya Windows Package Manager ile:
    ```powershell
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    ```
- **Önemli not:**
  - Kurulum sırasında mümkünse **Add Python to PATH** seçeneğini aktif et.

### 1.3 Ollama
- **Ne için gerekli?**
  - Yerelde çalışan LLM yorumları için.
  - Audio rapor yorumu, transcript yorumu ve vision yorumu burada kullanılır.
- **Yaklaşık indirme boyutu:**
  - Ollama uygulaması: ~1 GB altı kurulum alanı (ortama göre değişebilir)
  - Model indirimi ayrıca yapılır.
- **Nasıl indirilir?**
  - Resmi site: https://ollama.com/download
  - veya Windows Package Manager ile:
    ```powershell
    winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements
    ```

### 1.4 Ollama Modeli: `llama3.1`
- **Ne için gerekli?**
  - Audio, transcript ve vision metriklerinin doğal dilde yorumlanması için.
- **Yaklaşık indirme boyutu:**
  - `llama3.1:8b` için yaklaşık **4.7 GB** model dosyası beklenmelidir.
  - Çalışma sırasında ek RAM ihtiyacı olur.
- **Nasıl indirilir?**
  ```powershell
  ollama pull llama3.1
  ```

### 1.5 OpenAI API Key
- **Ne için gerekli?**
  - Realtime interview oturumu
  - transcription
  - bazı backend değerlendirmeleri
- `project/server/.env` dosyasında bulunmalıdır:
  ```env
  PORT=3001
  OPENAI_API_KEY=sk-...
  ```

---

## 2. Python Tarafında İndirilecek Paketler

Python virtual environment içinde şu büyük paketler kurulacaktır:

- `torch`
- `torchaudio`
- `transformers`
- `librosa`
- `opencv-python-headless`
- `mediapipe`
- `fastapi`
- `uvicorn`

### Yaklaşık disk / indirme etkisi
Bunlar birlikte birkaç yüz MB ile 1+ GB arasında alan kullanabilir. Özellikle:
- `torch` oldukça büyüktür.
- İlk model yüklemelerinde Hugging Face modelleri ayrıca disk alanı kullanır.
- `mediapipe` ve `opencv-python-headless` vision tarafı için gereklidir.

---

## 3. Repo İçindeki Klasörlerin Kısa Özeti

- `project/client`: React + Vite arayüzü
- `project/server`: Node.js backend
- `project/server/src/services/analysis/python_api`: Python analiz API'si
- `project/server/reports`: session bazlı rapor çıktıları
- `project/docs`: dokümantasyon dosyaları
- `scripts`: kurulum / çalıştırma scriptleri

---

## 4. Manuel Başlatma Adımları

Aşağıdaki komutlar, projenin **elle** nasıl başlatılacağını gösterir.

## TERMINAL 1

```powershell
cd C:\Users\basak\BIL496-sudo\project\server\src\services\analysis\python_api
python -m venv .venv

python -m pip install --upgrade pip
pip install -r requirements.txt

'{"mode":"health"}' | python .\frame_face_analyzer.py

python .\api.py
```

## TERMINAL 2

```powershell
cd C:\Users\basak\BIL496-sudo\project\server
$env:PYTHON_BIN="C:\Users\basak\BIL496-sudo\project\server\src\services\analysis\python_api\.venv\Scripts\python.exe"
npm install
npm run dev
```

## TERMINAL 3

```powershell
cd C:\Users\basak\BIL496-sudo\project\client
npm install
npm run dev
```

---

## 5. Beklenen Portlar

- Python Analysis API: `http://localhost:8000`
- Node.js Backend: `http://localhost:3001`
- Client (Vite): genelde `http://localhost:5173`

---

## 6. Rapor Klasör Yapısı

Her oturum için `project/server/reports` altında bir session klasörü oluşur:

```text
project/server/reports/
  S-1773944323392/
    audio/
      answer_01.webm
      answer_02.webm
    vision/
      frame_01.jpg
      frame_02.jpg
    audio_model_out.json
    audio_analysis_out.txt
    transcript_analysis_out.json
    transcript.txt
    vision_analysis_out.json
    vision_llm_analysis_out.json
```

- `audio/`: aday cevap sesleri
- `vision/`: seçilmiş vision sample JPEG'leri
- session root: tüm rapor/artifact dosyaları

---

## 7. Sık Karşılaşılan Sorunlar

### Python yanlış sürümle açılıyor
Şunu kontrol et:
```powershell
python --version
```
Beklenen sonuç: `Python 3.12.x`

### `mediapipe` çalışmıyor
Health check komutunu tekrar çalıştır:
```powershell
'{"mode":"health"}' | python .\frame_face_analyzer.py
```

### Ollama çalışmıyor
Önce kurulu mu bak:
```powershell
ollama --version
```
Model var mı bak:
```powershell
ollama list
```
Yoksa indir:
```powershell
ollama pull llama3.1
```

### Backend Python'ı bulamıyor
Terminal 2'de şu environment variable'ın doğru olduğundan emin ol:
```powershell
$env:PYTHON_BIN="C:\Users\basak\BIL496-sudo\project\server\src\services\analysis\python_api\.venv\Scripts\python.exe"
```

---

## 8. Otomatik Kurulum ve Başlatma

Windows üzerinde gerekli şeyleri kurup 3 terminali açan script:

```text
scripts/windows_full_setup_and_run.ps1
```

Bu script:
- Node.js kontrol eder / kurar
- Python 3.12 kontrol eder / kurar
- Ollama kontrol eder / kurar
- `llama3.1` modelini indirir
- Python `.venv` oluşturur
- `requirements.txt` yükler
- server/client `npm install` yapar
- Python API, Node backend ve Vite client için ayrı PowerShell pencereleri açar

