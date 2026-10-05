@echo off
title Club Quran Quiz - Server (do not close during the event)
cd /d "%~dp0"
echo ================================================
echo   Club Quran ENSIAS - Quiz Server
echo ================================================
echo.
echo   Keep this window OPEN during the event.
echo   Open in your browser:  http://localhost:3000
echo.
echo   To stop: close this window or press Ctrl+C.
echo ================================================
echo.
node server.js
echo.
echo (The server has stopped. Press any key to close.)
pause >nul
