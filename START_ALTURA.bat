@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

title ALTURA Store - Local Development

echo.
echo ============================================================
echo                  ALTURA STORE LAUNCHER
echo ============================================================
echo.

rem ------------------------------------------------------------
rem 1) Check Node.js and npm
rem ------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or is not available in PATH.
    echo.
    echo Install Node.js 20 LTS or newer, then run this file again.
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found in PATH.
    echo Reinstall Node.js with npm enabled, then try again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VERSION=%%v"
for /f "tokens=*" %%v in ('npm -v') do set "NPM_VERSION=%%v"
echo [OK] Node.js %NODE_VERSION%
echo [OK] npm %NPM_VERSION%

rem ------------------------------------------------------------
rem 2) Run a dependency-free local project check
rem ------------------------------------------------------------
echo [CHECK] Verifying local ALTURA files and product assets...
call node scripts\check-project.mjs
if errorlevel 1 (
    echo.
    echo [ERROR] Local project validation failed.
    echo Fix the missing files shown above, then run this launcher again.
    echo.
    pause
    exit /b 1
)
echo [OK] Local project validation passed.

rem ------------------------------------------------------------
rem 3) Create a local environment file on first run
rem ------------------------------------------------------------
if not exist ".env.local" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env.local" >nul
        echo [OK] Created .env.local from .env.example
    )
)

rem ------------------------------------------------------------
rem 4) Install project dependencies only when needed
rem ------------------------------------------------------------
if not exist "node_modules\.bin\next.cmd" (
    echo.
    echo [SETUP] Installing dependencies for the first run...
    echo        This needs an internet connection.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        echo Check your internet connection and the npm error above.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully.
)

rem ------------------------------------------------------------
rem 5) Find an available local port starting at 3000
rem ------------------------------------------------------------
set "PORT=3000"
:CHECK_PORT
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    set /a PORT+=1
    if !PORT! GTR 3010 (
        echo [ERROR] Ports 3000-3010 are already in use.
        echo Close another local server and try again.
        echo.
        pause
        exit /b 1
    )
    goto CHECK_PORT
)

set "ALTURA_URL=http://localhost:%PORT%"
echo.
echo [START] ALTURA will run at: %ALTURA_URL%
echo [INFO]  Keep this window open while you use the site.
echo [INFO]  Press Ctrl+C to stop the development server.
echo.

rem Wait for Next.js to become ready, then open the default browser.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$u='%ALTURA_URL%'; for($i=0;$i -lt 90;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1; if($r.StatusCode -ge 200){ Start-Process $u; exit 0 } } catch {}; Start-Sleep -Seconds 1 }"

rem ------------------------------------------------------------
rem 6) Start Next.js in development mode
rem ------------------------------------------------------------
call npm run dev -- -p %PORT%

set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" (
    echo [STOPPED] ALTURA development server has stopped.
) else (
    echo [ERROR] The development server exited with code %EXIT_CODE%.
)
echo.
pause
exit /b %EXIT_CODE%
