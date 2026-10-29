@echo off
setlocal
title DeepTutor AI Configuration

REM Auto-detect DeepTutor project directory
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PROJECT_DIR=%~dp0"
) else if exist "%USERPROFILE%\Documents\DeepTutor\.venv\Scripts\python.exe" (
    set "PROJECT_DIR=%USERPROFILE%\Documents\DeepTutor"
) else if exist "C:\Users\kazir\Documents\DeepTutor\.venv\Scripts\python.exe" (
    set "PROJECT_DIR=C:\Users\kazir\Documents\DeepTutor"
) else (
    echo [ERROR] Virtual environment not found at .venv\Scripts\python.exe.
    echo Please ensure DeepTutor is installed in Documents\DeepTutor.
    pause
    exit /b 1
)

if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

cd /d "%PROJECT_DIR%"
set "DEEPTUTOR_HOME=%PROJECT_DIR%"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

"%PROJECT_DIR%\.venv\Scripts\python.exe" "%PROJECT_DIR%\scripts\configure_ai.py"
