param(
    [switch]$InstallOnly,
    [switch]$SkipPyApi,
    [switch]$SkipServer,
    [switch]$SkipClient
)

$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$PyApiDir = Join-Path $RootDir 'project/server/src/services/analysis/python_api'
$PyVenvDir = Join-Path $PyApiDir '.venv'
$DefaultPythonBin = Join-Path $PyVenvDir 'Scripts/python.exe'
$PythonBin = if ($env:PYTHON_BIN) { $env:PYTHON_BIN } else { $DefaultPythonBin }
$ServerDir = Join-Path $RootDir 'project/server'
$ClientDir = Join-Path $RootDir 'project/client'
$LogDir = Join-Path $RootDir '.run-logs'

function Require-Command {
    param([string]$CommandName)
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $CommandName"
    }
}

function Start-LoggedProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$LogPath,
        [hashtable]$EnvironmentOverrides = @{}
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    foreach ($arg in $ArgumentList) {
        [void]$psi.ArgumentList.Add($arg)
    }
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    foreach ($entry in $EnvironmentOverrides.GetEnumerator()) {
        $psi.Environment[$entry.Key] = [string]$entry.Value
    }

    $logWriter = [System.IO.StreamWriter]::new($LogPath, $false)
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $process.EnableRaisingEvents = $true

    $outputHandler = [System.Diagnostics.DataReceivedEventHandler]{ param($sender, $args) if ($null -ne $args.Data) { $logWriter.WriteLine($args.Data); $logWriter.Flush() } }
    $errorHandler = [System.Diagnostics.DataReceivedEventHandler]{ param($sender, $args) if ($null -ne $args.Data) { $logWriter.WriteLine($args.Data); $logWriter.Flush() } }
    $exitedHandler = [System.EventHandler]{ param($sender, $args) $logWriter.Flush(); $logWriter.Dispose() }

    $process.add_OutputDataReceived($outputHandler)
    $process.add_ErrorDataReceived($errorHandler)
    $process.add_Exited($exitedHandler)

    [void]$process.Start()
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()
    return $process
}

Require-Command npm

if (-not (Test-Path $LogDir)) {
    [void](New-Item -ItemType Directory -Path $LogDir)
}

if (-not (Test-Path $PyVenvDir)) {
    Write-Host "[setup] Creating Python virtual environment at $PyVenvDir"
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv $PyVenvDir
    }
    else {
        & python -m venv $PyVenvDir
    }
}

if (-not (Test-Path $PythonBin)) {
    throw "Python interpreter not found at $PythonBin"
}

$PipBin = Join-Path $PyVenvDir 'Scripts/pip.exe'
Write-Host '[setup] Installing Python dependencies'
& $PipBin install --upgrade pip
& $PipBin install -r (Join-Path $PyApiDir 'requirements.txt')

Write-Host '[setup] Installing server npm dependencies'
& npm --prefix $ServerDir install

Write-Host '[setup] Installing client npm dependencies'
& npm --prefix $ClientDir install

if ($InstallOnly) {
    Write-Host '[done] Dependencies are installed.'
    Write-Host "       PYTHON_BIN=$PythonBin"
    exit 0
}

$processes = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
try {
    if (-not $SkipPyApi) {
        $pyApiLog = Join-Path $LogDir 'python-api.log'
        Write-Host '[run] Starting Python analysis API on http://localhost:8000'
        $processes.Add((Start-LoggedProcess -FilePath $PythonBin -ArgumentList @('api.py') -WorkingDirectory $PyApiDir -LogPath $pyApiLog))
    }

    if (-not $SkipServer) {
        $serverLog = Join-Path $LogDir 'server.log'
        Write-Host "[run] Starting Node backend with PYTHON_BIN=$PythonBin"
        $processes.Add((Start-LoggedProcess -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $ServerDir -LogPath $serverLog -EnvironmentOverrides @{ PYTHON_BIN = $PythonBin }))
    }

    if (-not $SkipClient) {
        $clientLog = Join-Path $LogDir 'client.log'
        Write-Host '[run] Starting Vite client on http://localhost:5173'
        $processes.Add((Start-LoggedProcess -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--host', '0.0.0.0') -WorkingDirectory $ClientDir -LogPath $clientLog))
    }

    Write-Host '[ready] Processes started.'
    Write-Host "  Python API log : $(Join-Path $LogDir 'python-api.log')"
    Write-Host "  Server log     : $(Join-Path $LogDir 'server.log')"
    Write-Host "  Client log     : $(Join-Path $LogDir 'client.log')"
    Write-Host ''
    Write-Host 'Flags:'
    Write-Host '  -InstallOnly  -> install deps only, do not start services'
    Write-Host '  -SkipPyApi    -> do not start Python analysis API'
    Write-Host '  -SkipServer   -> do not start Node backend'
    Write-Host '  -SkipClient   -> do not start Vite client'
    Write-Host ''
    Write-Host 'Press Ctrl+C to stop everything started by this script.'

    while ($true) {
        Start-Sleep -Seconds 2
        foreach ($proc in $processes) {
            if ($proc.HasExited) {
                throw "Process exited early (PID=$($proc.Id), ExitCode=$($proc.ExitCode)). Check .run-logs for details."
            }
        }
    }
}
finally {
    foreach ($proc in $processes) {
        if ($null -ne $proc -and -not $proc.HasExited) {
            try {
                $proc.Kill($true)
            }
            catch {
                Write-Warning "Failed to stop process PID=$($proc.Id): $_"
            }
        }
    }
}
