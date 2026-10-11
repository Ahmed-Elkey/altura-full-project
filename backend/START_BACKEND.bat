@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo       ALTURA Commerce Backend - Local
echo ==========================================
echo.

where node >nul 2>&1 || (
  echo [ERROR] Node.js was not found. Install Node.js 20 or newer.
  pause
  exit /b 1
)
where npm >nul 2>&1 || (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo [OK] Created .env from .env.example
)

if not exist "node_modules" (
  echo [INFO] Backend dependencies are not installed.
  echo        Run SETUP_BACKEND.bat first.
  pause
  exit /b 1
)

if not exist "prisma\migrations" (
  echo [INFO] Prisma migration history is not initialized.
  echo        Run SETUP_BACKEND.bat first.
  pause
  exit /b 1
)

echo [INFO] PostgreSQL must already be running and match DATABASE_URL in .env.

echo [INFO] Generating Prisma client...
call npm run prisma:generate || goto :fail

echo [INFO] Validating Prisma schema...
call npm run prisma:validate || goto :fail

echo [INFO] Applying existing migrations...
call npm run prisma:deploy || goto :fail

echo.
echo [INFO] Starting API on http://localhost:4000/api/v1
call npm run start:dev
exit /b %ERRORLEVEL%

:fail
echo.
echo [ERROR] ALTURA backend startup failed.
pause
exit /b 1
