@echo off
REM Kashin - one-command installer + launcher (Windows)
REM Usage: double-click install.bat, or run it from a terminal.
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ============================================
echo  ^|               Kashin                    ^|
echo  ^|  Local-first personal finance for Akahu  ^|
echo  ============================================

REM --- Node check ---
where node >nul 2>&1
if errorlevel 1 (
  echo  !! Node.js is not installed.
  echo    Download the LTS version from https://nodejs.org
  echo    then run this again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%V in ('node -v') do echo  ^> Node found: %%V

REM --- Dependencies ---
if not exist node_modules (
  echo  Installing dependencies ^(first run only^)...
  call npm install --no-audit --no-fund
)

REM --- Encryption key / .env.local ---
if not exist .env.local (
  copy .env.example .env.local >nul
  powershell -NoProfile -Command "$k = [Convert]::ToBase64String((New-Object byte[] 32)); (Get-Content '.env.local') | ForEach-Object { if ($_ -match '^AKAHU_ENCRYPTION_KEY=') { 'AKAHU_ENCRYPTION_KEY=' + $k } else { $_ } } | Set-Content '.env.local'"
  echo  ^> Generated a local encryption key.
)

echo  ^> Starting Kashin on http://localhost:3000
echo    Close this window or press Ctrl+C to stop.
echo.
call npm run dev -- -p 3000
pause