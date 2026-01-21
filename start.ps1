# DRAM PlaySV - Easy Startup Script
# Run: .\start.ps1

Write-Host "========================================"
Write-Host "    DRAM PlaySV - Media Server v5.0" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js not found! Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Get local IP for mobile access
$localIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*" -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
if (-not $localIP) {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.*" } | Select-Object -First 1).IPAddress
}

Write-Host ""
Write-Host "[INFO] Starting server..." -ForegroundColor Green
Write-Host ""
Write-Host "  Local:   http://localhost:3000" -ForegroundColor White
if ($localIP) {
    Write-Host "  Network: http://${localIP}:3000" -ForegroundColor White
}
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host "========================================"

# Start server
npm run dev
