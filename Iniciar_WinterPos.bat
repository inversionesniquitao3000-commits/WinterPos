@echo off
title WinterPos Punto de Venta - Servidor y App
cd /d "%~dp0"

if "%DEBUG_MODE%"=="" set DEBUG_MODE=true

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
        if not "%DEBUG_MODE%"=="false" pause
        exit /b 1
    )
)

if not "%DEBUG_MODE%"=="false" (
    echo ====================================================
    echo      INICIANDO WINTERPOS PUNTO DE VENTA (MODO DEBUG)
    echo ====================================================
)

"%NODE_CMD%" desktop-main.js

if not "%DEBUG_MODE%"=="false" (
    echo.
    echo ====================================================
    echo   El servidor WinterPos se ha detenido.
    echo ====================================================
    pause
)

