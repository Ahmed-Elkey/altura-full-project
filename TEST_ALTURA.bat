@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title ALTURA Store - Full Local QA

echo.
echo ============================================================
echo                  ALTURA FULL LOCAL QA
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 goto :NO_NODE
where npm >nul 2>&1
if errorlevel 1 goto :NO_NODE

echo [1/5] Checking local source, catalog, routes, and assets...
call npm run check:local
if errorlevel 1 goto :FAIL

echo.
if not exist "node_modules\.bin\next.cmd" (
  echo [2/5] Installing dependencies...
  call npm install
  if errorlevel 1 goto :FAIL
) else (
  echo [2/5] Dependencies already installed.
)

if not exist "%LOCALAPPDATA%\ms-playwright" (
  echo [SETUP] Installing the local Chromium QA browser...
  call npx playwright install chromium
  if errorlevel 1 goto :FAIL
)

echo.
echo [3/5] Building the optimized local storefront...
call npm run build
if errorlevel 1 goto :FAIL

echo.
echo [4/5] Running Playwright functional QA...
call npm run qa:functional
if errorlevel 1 goto :FAIL

echo.
echo [5/5] Capturing reference/current screenshots and layout diffs...
call npm run qa:visual
if errorlevel 1 goto :FAIL

echo.
echo ============================================================
echo [PASS] ALTURA FULL LOCAL QA COMPLETED SUCCESSFULLY
echo ============================================================
echo 9 active products / 21 visible colorways / 196 local assets.
echo Functional and visual QA passed. No deployment was performed.
echo.
pause
exit /b 0

:NO_NODE
echo [ERROR] Node.js/npm not found. Install Node.js 20 LTS or newer.
goto :FAIL

:FAIL
echo.
echo ============================================================
echo [FAIL] ALTURA QA DID NOT PASS
echo Review the error above. No deployment was performed.
echo ============================================================
echo.
pause
exit /b 1
