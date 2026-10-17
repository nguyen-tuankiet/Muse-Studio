@echo off
chcp 65001 >nul
rem Muse Studio - bam dup file nay de chay. Dong cua so nay la tat chuong trinh.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Dang mo trang tai Node.js - hay cai ban "LTS", cai xong bam dup lai file nay.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)
echo Dang khoi dong Muse Studio... Trinh duyet se tu mo sau vai giay.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:3000"
node server.js
echo.
echo Muse Studio da dung. Neu thay loi o tren, hay chup man hinh gui nguoi ho tro.
pause
