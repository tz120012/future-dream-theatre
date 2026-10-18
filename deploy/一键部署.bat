@echo off
rem Keep this file pure ASCII: cmd.exe mis-parses batch files containing
rem multi-byte characters, which can swallow the following command.
rem All Chinese messages live in deploy.ps1 (UTF-8 with BOM).
chcp 65001 >nul
cd /d "%~dp0"
set "PS=powershell"
where pwsh >nul 2>nul
if not errorlevel 1 set "PS=pwsh"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -Action start
if errorlevel 1 pause
