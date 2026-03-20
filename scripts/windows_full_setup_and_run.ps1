param(
    [string]$RepoRoot = "C:\Users\basak\BIL496-sudo",
    [switch]$InstallOnly
)

$ErrorActionPreference = "Stop"

$PythonVersion = "3.12"
$ProjectRoot = Join-Path $RepoRoot "project"
$PyApiDir = Join-Path $ProjectRoot "server\src\services\analysis\python_api"
$VenvDir = Join-Path $PyApiDir ".venv"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"
$ServerDir = Join-Path $ProjectRoot "server"
$ClientDir = Join-Path $ProjectRoot "client"
$RequirementsFile = Join-Path $PyApiDir "requirements.txt"

function Ensure-Command([string]$Name, [scriptblock]$InstallAction) {
    if (Get-Command $Name -ErrorAction SilentlyContinue) {
        Write-Host "[ok] $Name bulundu." -ForegroundColor Green
        return
    }

    Write-Host "[install] $Name bulunamadı, kuruluyor..." -ForegroundColor Yellow
    & $InstallAction
}

function Start-Terminal([string]$Title, [string]$Command) {
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "$host.ui.RawUI.WindowTitle = '$Title'; $Command"
    )
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Windows Full Setup and Run" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Ensure-Command "winget" { throw "winget bulunamadı. Lütfen Windows Package Manager kurulu bir sistem kullanın." }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
}

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements
}

if (-not (Test-Path $VenvDir)) {
    Write-Host "[setup] Python 3.12 venv oluşturuluyor..." -ForegroundColor Yellow
    py -3.12 -m venv $VenvDir
}

Write-Host "[setup] Python pip güncelleniyor..." -ForegroundColor Yellow
& $PythonExe -m pip install --upgrade pip

Write-Host "[setup] Python requirements yükleniyor..." -ForegroundColor Yellow
& $PythonExe -m pip install -r $RequirementsFile

Write-Host "[setup] Vision health check çalıştırılıyor..." -ForegroundColor Yellow
'{"mode":"health"}' | & $PythonExe (Join-Path $PyApiDir 'frame_face_analyzer.py')

Write-Host "[setup] Server npm install..." -ForegroundColor Yellow
Push-Location $ServerDir
npm install
Pop-Location

Write-Host "[setup] Client npm install..." -ForegroundColor Yellow
Push-Location $ClientDir
npm install
Pop-Location

Write-Host "[setup] Ollama llama3.1 modeli indiriliyor..." -ForegroundColor Yellow
ollama pull llama3.1

if ($InstallOnly) {
    Write-Host "[done] Kurulum tamamlandı. Servisler başlatılmadı." -ForegroundColor Green
    exit 0
}

$Terminal1 = @"
cd '$PyApiDir'
if (-not (Test-Path '.venv')) { py -3.12 -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install -r requirements.txt
'{"mode":"health"}' | .\.venv\Scripts\python.exe .\frame_face_analyzer.py
.\.venv\Scripts\python.exe .\api.py
"@

$Terminal2 = @"
cd '$ServerDir'
`$env:PYTHON_BIN='$PythonExe'
npm install
npm run dev
"@

$Terminal3 = @"
cd '$ClientDir'
npm install
npm run dev
"@

Start-Terminal -Title 'Terminal 1 - Python API' -Command $Terminal1
Start-Terminal -Title 'Terminal 2 - Node Server' -Command $Terminal2
Start-Terminal -Title 'Terminal 3 - Client' -Command $Terminal3

Write-Host "[ready] 3 terminal açıldı." -ForegroundColor Green
Write-Host "Terminal 1: Python API" -ForegroundColor Green
Write-Host "Terminal 2: Node backend" -ForegroundColor Green
Write-Host "Terminal 3: Vite client" -ForegroundColor Green
