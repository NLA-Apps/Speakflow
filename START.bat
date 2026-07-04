@echo off
title SpeakFlow
echo.
echo   SpeakFlow - starting local server...
echo   Open your browser at:  http://localhost:8765
echo.
start "" http://localhost:8765
python -m http.server 8765
