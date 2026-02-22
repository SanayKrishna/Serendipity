# Serendipity SNS - Start All Servers
# This script starts BOTH backend server AND public tunnel for mobile data access

Write-Host "🚀 Starting Serendipity SNS Servers..." -ForegroundColor Cyan

# Start Backend Server
Write-Host "`n📡 Starting Backend Server (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'a:\MaKanoo\internship\serendipity-sns\backend'; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

# Wait for backend to initialize
Start-Sleep -Seconds 3

# Start Public Tunnel (for Mobile Data access)
Write-Host "🌐 Starting Public Tunnel (Mobile Data Access)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "lt --port 8000; Read-Host 'Press Enter to close'"

# Wait for tunnel to initialize
Start-Sleep -Seconds 5

Write-Host "`n✅ Servers Starting!" -ForegroundColor Green
Write-Host "⚠️  IMPORTANT: Copy the tunnel URL from the tunnel window" -ForegroundColor Magenta
Write-Host "    and update mobile/src/config/api.ts if it changed!" -ForegroundColor Magenta
Write-Host "`nPress any key to exit this window..." -ForegroundColor Cyan
Read-Host "Press Enter to continue"
