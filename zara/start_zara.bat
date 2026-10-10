@echo off
title Zara - Personal AI Companion
cd /d "%~dp0"
echo.
echo   Starting Zara...
echo.
where python >nul 2>nul
if %errorlevel% neq 0 (
  echo   Python was not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".
  pause
  exit /b 1
)
python -c "import flask" >nul 2>nul || (echo   Installing Flask... & python -m pip install --quiet flask)
python app.py %*
pause
