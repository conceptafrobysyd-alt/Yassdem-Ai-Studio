@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez Node.js 24 LTS depuis https://nodejs.org/
  echo Puis fermez cette fenetre et relancez Ouvrir-Yassdem.cmd.
  pause
  exit /b 1
)
node.exe "%~dp0scripts\start-studio.mjs"
set "YASSDEM_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %YASSDEM_RESULT%
