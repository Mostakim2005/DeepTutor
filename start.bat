@echo off
setlocal
title DeepTutor Server Launcher

REM Auto-detect DeepTutor project directory
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PROJECT_DIR=%~dp0"
) else if exist "%USERPROFILE%\Documents\DeepTutor\.venv\Scripts\python.exe" (
    set "PROJECT_DIR=%USERPROFILE%\Documents\DeepTutor"
) else if exist "C:\Users\kazir\Documents\DeepTutor\.venv\Scripts\python.exe" (
    set "PROJECT_DIR=C:\Users\kazir\Documents\DeepTutor"
) else (
    echo [ERROR] Virtual environment not found at .venv\Scripts\python.exe.
    echo Searched in:
    echo   - %~dp0
    echo   - %USERPROFILE%\Documents\DeepTutor
    echo Please ensure DeepTutor is installed.
    echo.
    pause
    exit /b 1
)

REM Strip trailing backslash if present
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

cd /d "%PROJECT_DIR%"
set "DEEPTUTOR_HOME=%PROJECT_DIR%"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"
set "PYTHON=%PROJECT_DIR%\.venv\Scripts\python.exe"

echo ======================================================================
echo                     Starting DeepTutor Server
echo ======================================================================
echo Workspace: %PROJECT_DIR%
echo.

REM Check if backend or frontend are already running
powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 8001, 3782 -ErrorAction SilentlyContinue; if ($conn) { exit 10 } else { exit 0 }"
if errorlevel 10 (
    echo DeepTutor is already running!
    echo Opening http://localhost:3782 in your default browser...
    start http://localhost:3782
    echo.
    echo Press any key to exit this launcher [DeepTutor remains running].
    pause >nul
    exit /b 0
)

echo Starting DeepTutor (Backend + Frontend)...
echo Once ready, access the Web UI at: http://localhost:3782
echo To stop DeepTutor later, run stop.bat or close this window.
echo.

"%PYTHON%" -m deeptutor_cli.main start --home "%PROJECT_DIR%"
