@echo off
TITLE DRAM Cloud Drive Auto-Mount
CHCP 65001 > nul
SETLOCAL EnableDelayedExpansion

:: ================================================================
::  DRAM MEDIA SERVER - Cloud Drive Auto-Mount
::  Runs at Windows login to mount all cloud drives via rclone.
::  Add/remove drive entries below as needed.
:: ================================================================

:: Wait a bit for network to be ready
timeout /t 10 /nobreak > nul

:: Check rclone is available
where rclone >nul 2>nul
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] rclone not found in PATH. Exiting.
    exit /b 1
)

echo [%date% %time%] DRAM Cloud Auto-Mount starting...

:: ================================================================
:: DRIVE DEFINITIONS
:: Format: call :mount_drive REMOTE_NAME DRIVE_LETTER [OPTIONS]
:: Add new drives here when you set up OneDrive, etc.
:: ================================================================

call :mount_drive "gdrive:"    "G:" "--vfs-cache-mode full --vfs-cache-max-size 2G --vfs-read-chunk-size 32M --dir-cache-time 5m"
call :mount_drive "gphotos:"   "P:" "--vfs-cache-mode full --vfs-read-chunk-size 32M --read-only"

:: === ADD FUTURE DRIVES HERE ===
:: Uncomment and edit when OneDrive is set up:
:: call :mount_drive "onedrive:" "O:" "--vfs-cache-mode full --vfs-cache-max-size 2G --vfs-read-chunk-size 32M"

echo.
echo [%date% %time%] All mounts processed.
exit /b 0


:: ================================================================
:: MOUNT FUNCTION
:: ================================================================
:mount_drive
set REMOTE=%~1
set LETTER=%~2
set OPTS=%~3

:: Check if already mounted
if exist "%LETTER%\" (
    :: Verify it's actually accessible (not stale)
    dir /b "%LETTER%\" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        echo   [OK] %LETTER% (%REMOTE%) already mounted and accessible.
        exit /b 0
    ) else (
        echo   [WARN] %LETTER% exists but not accessible. Attempting remount...
        :: Try to unmount stale mount first
        rclone mount %REMOTE% %LETTER% --unmount 2>nul
        timeout /t 2 /nobreak >nul
    )
)

:: Check if the remote exists in rclone config
rclone listremotes 2>nul | findstr /i "%REMOTE%" >nul
if !ERRORLEVEL! NEQ 0 (
    echo   [SKIP] %REMOTE% not configured in rclone. Run 'rclone config' to add it.
    exit /b 0
)

:: Mount the drive
echo   [MOUNT] Mounting %REMOTE% to %LETTER%...
start /B "" rclone mount %REMOTE% %LETTER% %OPTS% --no-console 2>nul

:: Wait and verify
timeout /t 5 /nobreak >nul
if exist "%LETTER%\" (
    echo   [OK] %LETTER% (%REMOTE%) mounted successfully.
) else (
    echo   [FAIL] %LETTER% (%REMOTE%) failed to mount. Check token/auth.
    echo          Try: rclone config reconnect %REMOTE%
)
exit /b 0
