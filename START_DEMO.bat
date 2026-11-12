@echo off
cd /d "%~dp0"
echo TOP MIND ENTERPRISE - CLIENT DEMO
echo.
where node >nul 2>nul || (echo Please install Node.js LTS from https://nodejs.org/ & pause & exit /b 1)
if not exist node_modules (call npm install || (pause & exit /b 1))
call npm run dev
pause
