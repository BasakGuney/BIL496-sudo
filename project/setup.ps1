# Sudo-Interview AI - Otomatik Kurulum Betiği (Windows İçin)
# Bu script projedeki hem Node.js hem de Python gereksinimlerini kurar.
# Kullanım: Terminalde ".\setup.ps1" yazıp Enter'a basın.

$ErrorActionPreference = "Stop"
$NodeVersion = "v18" # Minimum beklenen sürüm

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Sudo-Interview AI Otomatik Kurulum Aracı" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Node.js ve npm Kontrolü
Write-Host "[1/5] Node.js ve npm kontrol ediliyor..." -ForegroundColor Yellow
if (Get-Command "npm" -ErrorAction SilentlyContinue) {
    # Hata döndürebilecek outputları yakalamıyoruz ama normal formatta almaya çalışıyoruz.
    $npmVer = (npm -v 2>$null).Trim()
    $nodeVer = (node -v 2>$null).Trim()
    Write-Host " Node.js sürümü: $nodeVer (npm: $npmVer) bulundu." -ForegroundColor Green
} else {
    Write-Host " UYARI: Node.js bulunamadı! Otomatik yükleniyor (Winget)..." -ForegroundColor Magenta
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    
    # Yeni PATH'i yükleyebilmek için oturum çevresi yenilenemeyeceğinden kullanıcıyı uyaralım.
    Write-Host " Node.js yüklendi ancak devreye girmesi için terminali Kapatıp YENİDEN AÇMANIZ gerekmektedir." -ForegroundColor Red
    Write-Host " Terminali yeniden açıp .\setup.ps1 betiğini tekrar çalıştırın." -ForegroundColor Yellow
    exit 0
}

# 2. Python Kontrolü
Write-Host "[2/5] Python kontrol ediliyor..." -ForegroundColor Yellow
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonVer = (python --version 2>$null).Trim()
    Write-Host " Python sürümü: $pythonVer bulundu." -ForegroundColor Green
} else {
    Write-Host " UYARI: Python bulunamadı! Otomatik yükleniyor (Winget)..." -ForegroundColor Magenta
    winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
    
    Write-Host " Python yüklendi ancak PATH (Ortam Değişkenleri) ayarlarının devreye girmesi için" -ForegroundColor Red
    Write-Host " terminali Kapatıp YENİDEN AÇMANIZ gerekmektedir." -ForegroundColor Red
    Write-Host " Terminali yeniden açıp .\setup.ps1 betiğini tekrar çalıştırın." -ForegroundColor Yellow
    exit 0
}

# 3. Node.js Bağımlılıklarının Kurulması (Server ve Client)
Write-Host "[3/5] Node.js Bağımlılıkları Kuruluyor..." -ForegroundColor Yellow

Write-Host "  -> Sunucu (Server) paketleri kuruluyor..." -ForegroundColor DarkGray
Push-Location "server"
npm install
Pop-Location
Write-Host "  Sunucu paketleri kuruldu." -ForegroundColor Green

Write-Host "  -> İstemci (Client) paketleri kuruluyor..." -ForegroundColor DarkGray
Push-Location "client"
npm install
Pop-Location
Write-Host "  İstemci paketleri kuruldu." -ForegroundColor Green

# 4. Python API Bağımlılıklarının Kurulması
Write-Host "[4/5] Python API Bağımlılıkları Kuruluyor..." -ForegroundColor Yellow
Push-Location "server\src\services\analysis\python_api"

# Venv oluştur
if (!(Test-Path "venv")) {
    Write-Host "  -> Sanal Ortam (venv) oluşturuluyor..." -ForegroundColor DarkGray
    python -m venv venv
} else {
    Write-Host "  -> Sanal Ortam (venv) zaten var, atlanıyor..." -ForegroundColor DarkGray
}

# Bağımlılıkları yükle
Write-Host "  -> requirements.txt içeriği yükleniyor..." -ForegroundColor DarkGray
# Windows'da venv içerisindeki python exesini direkt çağırabiliriz
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Pop-Location
Write-Host "  Python API paketleri kuruldu." -ForegroundColor Green

# 5. Ollama Kontrolü ve Llama3.1 indirilmesi
Write-Host "[5/5] Ollama ve Llama3.1 Modeli Kontrol Ediliyor..." -ForegroundColor Yellow
if (Get-Command "ollama" -ErrorAction SilentlyContinue) {
    Write-Host " Ollama kurulu. Llama3.1 modeli indiriliyor (zaten varsa güncellenir)..." -ForegroundColor DarkGray
    # Arka planda indirmeyi başlatır ama konsola log basmazsak indirme durumu gözükmez, o yüzden düz run diyoruz
    # Not: ollama pull kullanarak modeli başlatmadan indirebiliriz.
    ollama pull llama3.1
    Write-Host " Llama3.1 modeli hazır." -ForegroundColor Green
} else {
    Write-Host " UYARI: Ollama sistemde bulunamadı." -ForegroundColor Magenta
    Write-Host " Lokal metin analizi (Llama3) için Ollama'yı manuel kurmalısınız: https://ollama.com/" -ForegroundColor Magenta
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "KURULUM TAMAMLANDI!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Başlamak için:"
Write-Host "1. server klasöründe `.env` dosyanızı oluşturun ve OPENAI_API_KEY ekleyin."
Write-Host "2. Termial 1:   cd server\src\services\analysis\python_api   ->   .\venv\Scripts\activate   ->   uvicorn api:app --reload --port 8000"
Write-Host "3. Terminal 2:  cd server   ->   npm run dev"
Write-Host "4. Terminal 3:  cd client   ->   npm run dev"
Write-Host ""
