@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-JARVIS.ps1" -Detach
exit /b %ERRORLEVEL%
