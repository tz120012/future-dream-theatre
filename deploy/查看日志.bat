@echo off
rem Keep this file pure ASCII. See the one-click deploy bat for details.
chcp 65001 >nul
cd /d "%~dp0"
set "PS=powershell"
where pwsh >nul 2>nul
if not errorlevel 1 set "PS=pwsh"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -Action logs
if errorlevel 1 pause
