# stop.ps1 - Stop DeepTutor Server (Backend + Frontend)
$ProjectDir = $PSScriptRoot
$env:DEEPTUTOR_HOME = $ProjectDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "                     Stopping DeepTutor Server" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$Python = Join-Path $ProjectDir ".venv\Scripts\python.exe"
if (Test-Path $Python) {
    & $Python -m deeptutor_cli.main stop --home $ProjectDir 2>$null
}

$ports = @(8001, 3782)
$pids = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($pids) {
    foreach ($p in $pids) {
        try {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped process PID $p" -ForegroundColor Yellow
        } catch {}
    }
} else {
    Write-Host "No active DeepTutor processes were found on ports 8001/3782." -ForegroundColor Gray
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "DeepTutor server stopped." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
