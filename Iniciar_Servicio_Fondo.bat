@echo off
title WinterPos - Servidor en Segundo Plano
cd /d "%~dp0"

REM Detect portable node.exe or system node.exe
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
) else if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
) else (
    set "NODE_CMD=node"
)

cd /d "%~dp0backend"
"%NODE_CMD%" server.js
