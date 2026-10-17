@echo off
chcp 65001 >nul
rem Muse Studio - bam dup de chay NEN (khong hien cua so den). De tat: bam dup Stop.bat.
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3000

where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Dang mo trang tai Node.js - hay cai ban "LTS", cai xong bam dup lai file nay.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/api/health | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Dang khoi dong Muse Studio chay nen...
  if not exist data mkdir data
  powershell -NoProfile -Command "Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden -RedirectStandardOutput '%~dp0data\server.log' -RedirectStandardError '%~dp0data\server-error.log'"
  powershell -NoProfile -Command "for ($i = 0; $i -lt 30; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:%PORT%/api/health | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
  if errorlevel 1 (
    echo Khong khoi dong duoc. Mo file data\server-error.log de xem loi, hoac chup man hinh gui nguoi ho tro.
    pause
    exit /b 1
  )
) else (
  echo Muse Studio dang chay san.
)
start http://127.0.0.1:%PORT%
echo Xong. Muse Studio dang chay nen. De tat hoan toan, bam dup Stop.bat.
ping -n 4 127.0.0.1 >nul
