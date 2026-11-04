@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required to start Folio.
 pause
 exit /b 1
)
start "" "http://localhost:4173"
node server.mjs
pause
