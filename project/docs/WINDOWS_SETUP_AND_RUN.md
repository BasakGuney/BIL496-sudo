# Windows Kurulum ve Çalıştırma Rehberi

Bu dosya, projeyi **Windows üzerinde sıfırdan** kurup çalıştırmak için gereken her şeyi anlatır.

> Bu rehberdeki örnek path şu klasörü baz alır:
>
> `C:\Users\basak\BIL496-sudo`
>
> Projeyi başka bir yere indirdiysen, komutlardaki path'i kendi klasörüne göre değiştir.

---

## 1. Gerekli Kurulumlar

### 1.1 Node.js

- **Gerekli sürüm:** Node.js LTS (18+; tercihen güncel LTS)
- **Ne için gerekli?**
  - `project/server` — Node.js backend
  - `project/client` — React/Vite frontend
- **Nasıl indirilir?**
  - Resmi site: https://nodejs.org/
  - veya Windows Package Manager ile:
    ```powershell
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    ```

### 1.2 Python 3.12

- **Gerekli sürüm:** Python 3.12 (3.12.x)
- **Neden 3.12?**
  - `mediapipe` kütüphanesi Python 3.12'ye kadar resmi destek vermektedir.
- **Nasıl indirilir?**
  - Resmi site: https://www.python.org/downloads/release/python-3120/
  - veya Windows Package Manager ile:
    ```powershell
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    ```
- **Önemli:** Kurulum sırasında **"Add Python to PATH"** seçeneğini aktif et.

### 1.3 OpenAI API Key

- **Ne için gerekli?**
  - OpenAI Realtime API — AI mülakatçı ses akışı
  - `gpt-4o-mini` — canlı hint, canlı feedback, analiz yorumu (ses/transcript/görüntü)
- `.env` dosyasını `project/server/` altında oluştur:
  ```env
  PORT=3001
  OPENAI_API_KEY=sk-...
  ```

> **Not:** Önceki sürümlerde kullanılan Ollama / llama3.1 lokal modeli **kaldırıldı**. Tüm LLM çağrıları artık OpenAI API üzerinden yapılmaktadır.

---

## 2. Python Paketleri

Python virtual environment içinde `requirements.txt` ile şu paketler kurulur:

| Paket | Ne İçin |
|---|---|
| `torch` | Ses modelleri (CPU/GPU) |
| `torchaudio` | Ses dosyası işleme |
| `transformers` | wav2vec2 modelleri (duygu + netlik) |
| `librosa` | Ses analizi (WPM, duraklama oranı) |
| `opencv-python-headless` | Görüntü frame işleme |
| `mediapipe` | Yüz tespiti (BlazeFace) |
| `fastapi` | Python HTTP API sunucusu |
| `uvicorn` | ASGI sunucu (FastAPI için) |
| `requests` | OpenAI API çağrıları |
| `numpy` | Sayısal hesaplamalar |

**Disk alanı notu:**
- `torch` + `transformers` → ~1–2 GB
- Hugging Face model önbelleği (wav2vec2 modelleri) → `.model-cache/` altında ilk çalıştırmada indirilir
- MediaPipe BlazeFace modeli → `.model-cache/blaze_face_short_range.tflite`

---

## 3. Dizin Yapısı Özeti

```
project/
├── client/                              ← React + Vite arayüzü
├── server/                              ← Node.js backend
│   ├── src/
│   │   └── services/analysis/python_api/ ← Python analiz API'si
│   └── reports/                         ← Oturum bazlı rapor çıktıları
├── docs/                                ← Bu dosya ve sistem mimarisi
└── scripts/                             ← Kurulum/çalıştırma scriptleri
```

---

## 4. Manuel Başlatma Adımları

3 ayrı terminal penceresi açılmalıdır.

### TERMINAL 1 — Python API

```powershell
cd C:\Users\basak\BIL496-sudo\project\server\src\services\analysis\python_api

# Sanal ortam oluştur (ilk seferinde)
python -m venv .venv

# Sanal ortamı aktif et
.\.venv\Scripts\Activate.ps1

# Paketleri güncelle ve kur (ilk seferinde)
python -m pip install --upgrade pip
pip install -r requirements.txt

# API sunucusunu başlat
python api.py
```

> `http://localhost:8000` adresinde çalışmaya başlar.

### TERMINAL 2 — Node.js Sunucusu

```powershell
cd C:\Users\basak\BIL496-sudo\project\server

# Python sanal ortamının yolunu bildir
$env:PYTHON_BIN="C:\Users\basak\BIL496-sudo\project\server\src\services\analysis\python_api\.venv\Scripts\python.exe"

# Paketleri kur (ilk seferinde)
npm install

# Sunucuyu başlat
npm run dev
```

> `http://localhost:3001` adresinde çalışmaya başlar.

### TERMINAL 3 — React İstemcisi

```powershell
cd C:\Users\basak\BIL496-sudo\project\client

# Paketleri kur (ilk seferinde)
npm install

# Geliştirme sunucusunu başlat
npm run dev
```

> `http://localhost:5173` adresinde çalışmaya başlar.

---

## 5. Beklenen Portlar

| Servis | URL |
|---|---|
| Python Analysis API | `http://localhost:8000` |
| Node.js Backend | `http://localhost:3001` |
| React İstemcisi (Vite) | `http://localhost:5173` |

---

## 6. Hızlı Başlatma (PS1 Script)

Tüm adımları otomatik yapmak için tek komut:

```powershell
cd C:\Users\basak\BIL496-sudo\project
.\scripts\windows_full_setup_and_run.ps1
```

Script şunları otomatik yapar:

- Node.js ve Python 3.12 varlığını kontrol eder
- `.venv` sanal ortamı oluşturur (ilk seferde)
- `requirements.txt` paketlerini kurar
- `server/` ve `client/` için `npm install` çalıştırır
- Python API, Node.js backend ve React istemcisi için **3 ayrı PowerShell penceresi** açar

> **Not:** İlk çalıştırmada `torch`, `transformers` ve diğer büyük paketler indirileceğinden birkaç dakika sürebilir.
