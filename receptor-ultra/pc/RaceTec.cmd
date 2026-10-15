@echo off
rem Camberas -> RaceTec: arranca el programa en esta misma ventana (Ctrl+C para parar)
title RaceTec - Camberas
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0RaceTec.ps1"
pause
