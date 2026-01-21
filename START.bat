@echo off
title DRAM PlaySV Media Server
color 0A

echo ========================================
echo     DRAM PlaySV - Media Server v5.0
echo ========================================
echo.

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Please install Node.js first.
    echo Download: https://nodejs.org
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
)

:: Start MPV if exists
if exist "mpv\mpv.exe" (
    echo [INFO] MPV found in project folder.
)

echo.
echo [INFO] Starting server...
echo [INFO] Open browser: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server.
echo ========================================

:: Start server
npm run dev

pause
