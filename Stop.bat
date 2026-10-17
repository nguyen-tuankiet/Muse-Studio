@echo off
chcp 65001 >nul
rem Tat Muse Studio dang chay nen va dong trinh duyet Chrome/Edge ma tool da mo.
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3000
powershell -NoProfile -Command "$stopped = 0; Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; $stopped++ }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*browser-profile*remote-debugging-port*' -or $_.CommandLine -like '*remote-debugging-port*browser-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; if ($stopped) { Write-Host 'Da tat Muse Studio.' } else { Write-Host 'Muse Studio khong chay.' }"
ping -n 3 127.0.0.1 >nul
