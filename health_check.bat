@echo off
TITLE DRAM Health Check
CHCP 65001 > nul
SETLOCAL EnableDelayedExpansion

:: ================================================================
::   DRAM MEDIA SERVER - Health Check Script
::   Run manually or schedule with Task Scheduler for monitoring
:: ================================================================

set BACKEND_PORT=8000
set CHECK_PASSED=0
set CHECK_FAILED=0

echo ========================================
echo   DRAM Media Server Health Check
echo   %date% %time%
echo ========================================
echo.

:: -----------------------------------------------
:: CHECK 1: Backend API responding
:: -----------------------------------------------
echo [1] Checking Backend API (port %BACKEND_PORT%)...
curl -s -o nul -w "%%{http_code}" http://localhost:%BACKEND_PORT%/system/stats > "%TEMP%\dram_health_code.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\dram_health_code.txt"

if "%HTTP_CODE%"=="200" (
    echo     [PASS] Backend is responding (HTTP 200^)
    set /a CHECK_PASSED+=1
) else (
    echo     [FAIL] Backend not responding (HTTP %HTTP_CODE%^)
    echo     Action: Check if START_DRAM_SERVER.bat is running
    set /a CHECK_FAILED+=1
)
echo.

:: -----------------------------------------------
:: CHECK 2: Frontend (Vite) responding
:: -----------------------------------------------
echo [2] Checking Frontend (port 5173)...
curl -s -o nul -w "%%{http_code}" http://localhost:5173 > "%TEMP%\dram_health_code.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\dram_health_code.txt"

if "%HTTP_CODE%"=="200" (
    echo     [PASS] Frontend is responding (HTTP 200^)
    set /a CHECK_PASSED+=1
) else (
    echo     [FAIL] Frontend not responding (HTTP %HTTP_CODE%^)
    set /a CHECK_FAILED+=1
)
echo.

:: -----------------------------------------------
:: CHECK 3: Google Drive mount (G:)
:: -----------------------------------------------
echo [3] Checking Google Drive mount (G:)...
if exist "G:\" (
    dir /b "G:\" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        echo     [PASS] G: drive is accessible
        set /a CHECK_PASSED+=1
    ) else (
        echo     [WARN] G: drive exists but cannot list contents
        echo     Action: Remount with rclone
        set /a CHECK_FAILED+=1
    )
) else (
    echo     [SKIP] G: drive not configured
)
echo.

:: -----------------------------------------------
:: CHECK 4: Google Photos mount (P:)
:: -----------------------------------------------
echo [4] Checking Google Photos mount (P:)...
if exist "P:\" (
    dir /b "P:\" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        echo     [PASS] P: drive is accessible
        set /a CHECK_PASSED+=1
    ) else (
        echo     [WARN] P: drive exists but cannot list contents
        set /a CHECK_FAILED+=1
    )
) else (
    echo     [SKIP] P: drive not configured
)
echo.

:: -----------------------------------------------
:: CHECK 5: Disk space
:: -----------------------------------------------
echo [5] Checking disk space...
for /f "tokens=3" %%a in ('dir /-c "%~dp0" ^| findstr /c:"bytes free"') do (
    set FREE_BYTES=%%a
)
echo     Free space: %FREE_BYTES% bytes
set /a CHECK_PASSED+=1
echo.

:: -----------------------------------------------
:: CHECK 6: Log directory size
:: -----------------------------------------------
echo [6] Checking log directory...
set LOG_DIR=%~dp0logs
if exist "%LOG_DIR%" (
    for /f %%a in ('dir /s /a /-c "%LOG_DIR%" ^| findstr /c:"File(s)"') do (
        echo     Log files total: %%a bytes
    )
    set /a CHECK_PASSED+=1
) else (
    echo     [INFO] No log directory found (first run?)
)
echo.

:: -----------------------------------------------
:: Summary
:: -----------------------------------------------
echo ========================================
echo   Results: %CHECK_PASSED% passed, %CHECK_FAILED% failed
echo ========================================

if %CHECK_FAILED% GTR 0 (
    echo   STATUS: ISSUES DETECTED
    echo   Review the [FAIL] items above.
) else (
    echo   STATUS: ALL CHECKS PASSED
)
echo.

:: Clean temp files
del "%TEMP%\dram_health_code.txt" 2>nul

pause
