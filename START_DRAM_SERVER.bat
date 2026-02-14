@echo off
TITLE DRAM MEDIA SERVER - PRODUCTION STARTUP
CHCP 65001 > nul
SETLOCAL EnableDelayedExpansion

:: ================================================================
::  DRAM MEDIA SERVER - Auto-Restart & Log Rotation Startup Script
:: ================================================================

:: Configuration
set BACKEND_PORT=8000
set FRONTEND_PORT=5173
set DRIVE_ROOT=%~dp0
set LOG_DIR=%DRIVE_ROOT%logs
set MAX_LOG_AGE_DAYS=7
set RESTART_DELAY=5

:: Create log directory
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: ================================================================
:: STEP 1: Clean old logs (older than %MAX_LOG_AGE_DAYS% days)
:: ================================================================
echo [LOG] Cleaning logs older than %MAX_LOG_AGE_DAYS% days...
forfiles /p "%LOG_DIR%" /s /m *.log /d -%MAX_LOG_AGE_DAYS% /c "cmd /c del @path" 2>nul
echo [LOG] Done.

:: ================================================================
:: STEP 2: Check & Mount Rclone Drives (if configured)
:: ================================================================
echo [RCLONE] Checking cloud drive mounts...

:: Check G: drive (Google Drive)
if exist "G:\" (
    echo   [OK] G: drive is mounted.
) else (
    echo   [WARN] G: drive not found. Attempting mount...
    where rclone >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        start /B "" rclone mount gdrive: G: --vfs-cache-mode full --vfs-cache-max-size 2G --vfs-read-chunk-size 32M --dir-cache-time 5m
        timeout /t 3 /nobreak >nul
        if exist "G:\" (
            echo   [OK] G: drive mounted successfully.
        ) else (
            echo   [FAIL] Could not mount G: drive. Check rclone config.
        )
    ) else (
        echo   [SKIP] rclone not found in PATH.
    )
)

:: Check P: drive (Google Photos)
if exist "P:\" (
    echo   [OK] P: drive is mounted.
) else (
    echo   [WARN] P: drive not found. Attempting mount...
    where rclone >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        start /B "" rclone mount gphotos: P: --vfs-cache-mode full --vfs-read-chunk-size 32M --read-only
        timeout /t 3 /nobreak >nul
        if exist "P:\" (
            echo   [OK] P: drive mounted successfully.
        ) else (
            echo   [FAIL] Could not mount P: drive. Check rclone config.
        )
    ) else (
        echo   [SKIP] rclone not found in PATH.
    )
)

echo.

:: ================================================================
:: STEP 3: Start Frontend (Vite dev server)
:: ================================================================
echo [2/3] Starting FRONTEND (Vite)...
set FRONTEND_LOG=%LOG_DIR%\frontend_%date:~-4,4%%date:~-7,2%%date:~-10,2%.log
start "DRAM FRONTEND" cmd /c "cd /d %DRIVE_ROOT%frontend && npm run dev >> "%FRONTEND_LOG%" 2>&1"

:: ================================================================
:: STEP 4: Start Backend with Auto-Restart Loop
:: ================================================================
echo [3/3] Starting BACKEND with auto-restart (FastAPI)...
echo.
echo ========================================================
echo        DRAM MEDIA SERVER - RUNNING  
echo ========================================================
echo   Backend:  http://localhost:%BACKEND_PORT%
echo   Frontend: http://localhost:%FRONTEND_PORT%
echo   Logs:     %LOG_DIR%
echo ========================================================
echo   Press Ctrl+C to stop the server.
echo ========================================================
echo.

:: Wait for services to initialize, then open browser
timeout /t 4 /nobreak >nul
start http://localhost:%FRONTEND_PORT%

:: ================================================================
:: Backend auto-restart loop
:: ================================================================
:restart_backend
set TIMESTAMP=%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKEND_LOG=%LOG_DIR%\backend_%TIMESTAMP%.log

echo [%date% %time%] Backend starting... (log: %BACKEND_LOG%)

cd /d %DRIVE_ROOT%backend
python -m uvicorn app.main:app --host 0.0.0.0 --port %BACKEND_PORT% >> "%BACKEND_LOG%" 2>&1

:: If we reach here, backend has exited (crashed or stopped)
echo.
echo [%date% %time%] !! Backend exited. Restarting in %RESTART_DELAY% seconds...
echo [%date% %time%] !! Check log: %BACKEND_LOG%
echo.

timeout /t %RESTART_DELAY% /nobreak >nul
goto restart_backend
