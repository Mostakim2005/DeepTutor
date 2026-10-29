# start.ps1 - Start DeepTutor Server (Backend + Frontend)
$ProjectDir = $PSScriptRoot
$env:DEEPTUTOR_HOME = $ProjectDir
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$Python = Join-Path $ProjectDir ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    Write-Host "[ERROR] Virtual environment not found at $Python" -ForegroundColor Red
    Write-Host "Please ensure Python dependencies are installed." -ForegroundColor Yellow
    exit 1
}

$conn = Get-NetTCPConnection -LocalPort 8001, 3782 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "DeepTutor is already running!" -ForegroundColor Green
    Write-Host "Opening http://localhost:3782 in your default browser..." -ForegroundColor Cyan
    Start-Process "http://localhost:3782"
    exit 0
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "                     Starting DeepTutor Server" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Workspace: $ProjectDir"
Write-Host "Backend API: http://127.0.0.1:8001"
Write-Host "Frontend:    http://localhost:3782"
Write-Host "Press Ctrl+C or run .\stop.ps1 to stop." -ForegroundColor Yellow
Write-Host ""

& $Python -m deeptutor_cli.main start --home $ProjectDir
