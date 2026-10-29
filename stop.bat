@echo off
setlocal
title Stop DeepTutor Server

REM Auto-detect DeepTutor project directory
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PROJECT_DIR=%~dp0"
) else if exist "%USERPROFILE%\Documents\DeepTutor\.venv\Scripts\python.exe" (
    set "PROJECT_DIR=%USERPROFILE%\Documents\DeepTutor"
) else if exist "C:\Users\kazir\Documents\DeepTutor\.venv\Scripts\python.exe" (
    set "PROJECT_DIR=C:\Users\kazir\Documents\DeepTutor"
) else (
    set "PROJECT_DIR=%USERPROFILE%\Documents\DeepTutor"
)

if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

cd /d "%PROJECT_DIR%"
set "DEEPTUTOR_HOME=%PROJECT_DIR%"

echo ======================================================================
echo                     Stopping DeepTutor Server
echo ======================================================================

if exist "%PROJECT_DIR%\.venv\Scripts\python.exe" (
    "%PROJECT_DIR%\.venv\Scripts\python.exe" -m deeptutor_cli.main stop --home "%PROJECT_DIR%" 2>nul
)

REM Ensure any processes holding port 8001 or 3782 are cleanly closed
powershell -NoProfile -Command ^
    "$ports = @(8001, 3782); " ^
    "$pids = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
    "if ($pids) { " ^
    "    foreach ($p in $pids) { " ^
    "        try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host \"Stopped process PID $p\" } catch {} " ^
    "    } " ^
    "} else { " ^
    "    Write-Host \"No active DeepTutor processes were found on ports 8001/3782.\" " ^
    "}"

echo.
echo ======================================================================
echo DeepTutor server stopped.
echo ======================================================================
ping 127.0.0.1 -n 3 >nul
