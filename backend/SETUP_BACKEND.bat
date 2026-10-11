@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo       ALTURA Backend - Phase 7 Setup
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
  echo [IMPORTANT] The .env secrets are development placeholders only.
)

echo [INFO] Installing backend dependencies...
call npm install || goto :fail

echo [INFO] PostgreSQL must already be running and match DATABASE_URL in .env.

echo [INFO] Generating Prisma client...
call npm run prisma:generate || goto :fail

echo [INFO] Validating Prisma schema...
call npm run prisma:validate || goto :fail

echo [INFO] Creating/applying local Prisma migration...
call npm run prisma:migrate -- --name phase7_admin || goto :fail

echo [INFO] Seeding the ALTURA catalog...
call npm run db:seed || goto :fail

echo [INFO] Running TypeScript typecheck...
call npm run typecheck || goto :fail

echo [INFO] Running cumulative Phase 2-7 static checks...
call npm run check:phase2 || goto :fail
call npm run check:phase3 || goto :fail
call npm run check:phase4 || goto :fail
call npm run check:phase5 || goto :fail
call npm run check:phase6 || goto :fail
call npm run check:phase7 || goto :fail

echo.
echo [OK] ALTURA backend Phase 7 setup completed.
echo      Start it with START_BACKEND.bat
echo      Swagger: http://localhost:4000/api/v1/docs
pause
exit /b 0

:fail
echo.
echo [ERROR] ALTURA backend setup failed.
pause
exit /b 1
