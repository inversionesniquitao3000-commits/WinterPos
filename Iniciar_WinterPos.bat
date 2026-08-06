@echo off
title WinterPos Punto de Venta - Servidor y App
cd /d "%~dp0"

REM 1. Detect portable node.exe or system node.exe
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
) else if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set "NODE_CMD=node"
    ) else (
        echo [ERROR] No se encontro el ejecutable de Node.js en el equipo.
        echo Por favor asegurese de incluir node.exe en la carpeta de la aplicacion.
        msg * "WinterPos Error: No se encontro Node.js en este equipo. Por favor instale Node.js o incluya node.exe ejecutable en la carpeta del programa."
        pause
        exit /b 1
    )
)

echo ====================================================
echo      INICIANDO WINTERPOS PUNTO DE VENTA
echo ====================================================
"%NODE_CMD%" desktop-main.js

