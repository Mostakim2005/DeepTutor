# configure-ai.ps1 - DeepTutor AI Provider Configuration
$ProjectDir = $PSScriptRoot
$Python = Join-Path $ProjectDir ".venv\Scripts\python.exe"
$ConfigureScript = Join-Path $ProjectDir "scripts\configure_ai.py"

if (-not (Test-Path $Python)) {
    Write-Host "[ERROR] Virtual environment not found at $Python" -ForegroundColor Red
    exit 1
}

& $Python $ConfigureScript
