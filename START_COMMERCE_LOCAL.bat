@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo       ALTURA Commerce - Local Stack
echo ==========================================
echo.

if not exist "backend\node_modules" (
  echo [ERROR] Backend dependencies are not installed.
  echo         Run backend\SETUP_BACKEND.bat first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] Frontend dependencies are not installed.
  echo         Run npm install in the project root first.
  pause
  exit /b 1
)

start "ALTURA API" cmd /k "cd /d ""%~dp0backend"" && call START_BACKEND.bat"
timeout /t 3 /nobreak >nul
call START_ALTURA.bat
