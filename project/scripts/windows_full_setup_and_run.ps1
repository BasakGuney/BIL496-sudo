# ============================================================
#  AI Mulakat Simulatoru - Windows Tam Kurulum ve Baslat
#  Kullanım: projenin kökünden çalıştır
#    cd .\project
#    .\scripts\windows_full_setup_and_run.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# Projeyi nerede arıyoruz?
$ROOT = Split-Path -Parent $PSScriptRoot
$PYTHON_API_DIR = "$ROOT\server\src\services\analysis\python_api"
$VENV_DIR       = "$ROOT\server\.venv-analysis"
$VENV_PYTHON    = "$VENV_DIR\Scripts\python.exe"
$SERVER_DIR     = "$ROOT\server"
$CLIENT_DIR     = "$ROOT\client"

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  AI Mulakat Simulatoru - Kurulum ve Baslat      " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Node.js kontrolu ──────────────────────────────────────
Write-Host "[1/5] Node.js kontrol ediliyor..." -ForegroundColor Yellow
try {
    $nodeVer = node --version 2>&1
    Write-Host "      Node.js bulundu: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "      Node.js bulunamadi. Lutfen https://nodejs.org/ adresinden kurun." -ForegroundColor Red
    exit 1
}

# ── 2. Python 3.12 kontrolu ──────────────────────────────────
Write-Host "[2/5] Python 3.12 kontrol ediliyor..." -ForegroundColor Yellow
$pythonExe = $null
foreach ($candidate in @("python", "python3", "py")) {
    try {
        $ver = & $candidate --version 2>&1
        if ($ver -match "Python 3\.12") {
            $pythonExe = $candidate
            Write-Host "      Python bulundu ($candidate): $ver" -ForegroundColor Green
            break
        }
    } catch { }
}
if (-not $pythonExe) {
    # py launcher ile 3.12'yi dene
    try {
        $ver = py -3.12 --version 2>&1
        if ($ver -match "Python 3\.12") {
            $pythonExe = "py -3.12"
            Write-Host "      Python bulundu (py -3.12): $ver" -ForegroundColor Green
        }
    } catch { }
}
if (-not $pythonExe) {
    Write-Host "      Python 3.12 bulunamadi." -ForegroundColor Red
    Write-Host "      Lutfen https://www.python.org/downloads/release/python-3120/ adresinden kurun." -ForegroundColor Red
    exit 1
}

# 3. Python sanal ortami ve paketler
Write-Host "[3/5] Python sanal ortami (venv) hazirlaniyor..." -ForegroundColor Yellow

if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "      .venv-analysis olusturuluyor..." -ForegroundColor Gray
    Set-Location $SERVER_DIR
    if ($pythonExe -eq "py -3.12") {
        py -3.12 -m venv .venv-analysis
    } else {
        & $pythonExe -m venv .venv-analysis
    }
    Write-Host "      .venv-analysis olusturuldu." -ForegroundColor Green
} else {
    Write-Host "      .venv-analysis zaten mevcut, atlanıyor." -ForegroundColor Green
}

Write-Host "      requirements.txt kuruluyor..." -ForegroundColor Gray
Set-Location $PYTHON_API_DIR
& "$VENV_DIR\Scripts\pip.exe" install --upgrade pip --quiet
& "$VENV_DIR\Scripts\pip.exe" install -r requirements.txt --quiet
Write-Host "      Python paketleri hazir." -ForegroundColor Green

# ── 4. npm install ───────────────────────────────────────────
Write-Host "[4/5] npm bagimliliklari yukleniyor..." -ForegroundColor Yellow

Write-Host "      server/ icin npm install..." -ForegroundColor Gray
Set-Location $SERVER_DIR
npm install --silent
Write-Host "      server/ hazir." -ForegroundColor Green

Write-Host "      client/ icin npm install..." -ForegroundColor Gray
Set-Location $CLIENT_DIR
npm install --silent
Write-Host "      client/ hazir." -ForegroundColor Green

# ── 5. Servisleri ayri pencerelerde baslat ───────────────────
Write-Host "[5/5] Servisler baslatiliyor..." -ForegroundColor Yellow

# Terminal 1 — Python Analysis API
Write-Host "      Python API penceresi aciliyor (port 8000)..." -ForegroundColor Gray
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$PYTHON_API_DIR'; Write-Host 'Python Analysis API baslatiliyor...' -ForegroundColor Cyan; & '$VENV_PYTHON' api.py"
) -WindowStyle Normal

Start-Sleep -Seconds 3

# Terminal 2 — Node.js Backend
Write-Host "      Node.js backend penceresi aciliyor (port 3001)..." -ForegroundColor Gray
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$SERVER_DIR'; `$env:PYTHON_BIN='$VENV_PYTHON'; Write-Host 'Node.js backend baslatiliyor...' -ForegroundColor Cyan; npm run dev"
) -WindowStyle Normal

Start-Sleep -Seconds 2

# Terminal 3 — React Client
Write-Host "      React istemcisi penceresi aciliyor (port 5173)..." -ForegroundColor Gray
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$CLIENT_DIR'; Write-Host 'React istemcisi baslatiliyor...' -ForegroundColor Cyan; npm run dev"
) -WindowStyle Normal

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Tum servisler baslatildi!                     " -ForegroundColor Cyan
Write-Host "                                                 " -ForegroundColor Cyan
Write-Host "  Python API :  http://localhost:8000            " -ForegroundColor Green
Write-Host "  Node.js    :  http://localhost:3001            " -ForegroundColor Green
Write-Host "  React UI   :  http://localhost:5173            " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Not: Her servis kendi penceresinde calisiyor." -ForegroundColor Gray
Write-Host "     Kapatmak icin her penceredeki Ctrl+C ile durdurabilirsiniz." -ForegroundColor Gray
