@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\.bin\tsc.cmd" (
  echo Dependencies are missing. Install Node.js dependencies with npm install first.
  pause
  exit /b 1
)

echo Building Extrack...
call ".\node_modules\.bin\tsc.cmd" -b
if errorlevel 1 (
  echo TypeScript build failed.
  pause
  exit /b 1
)

call ".\node_modules\.bin\vite.cmd" build
if errorlevel 1 (
  echo Frontend build failed.
  pause
  exit /b 1
)

echo Starting Extrack at http://localhost:8787
node server\index.js
pause
