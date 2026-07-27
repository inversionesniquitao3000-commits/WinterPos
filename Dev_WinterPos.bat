@echo off
title WinterPos - Modo Desarrollo
cd /d "%~dp0"

echo ====================================================
echo    WINTERPOS - MODO DESARROLLO
echo    Iniciando Backend + Frontend + WhatsApp
echo ====================================================
echo.

REM --- Verificar que node_modules del backend exista ---
if not exist "%~dp0backend\node_modules" (
    echo [Backend] Instalando dependencias del backend...
    start "Instalando Backend" cmd /k "cd /d %~dp0backend && npm install && echo INSTALACION COMPLETADA - Cierra esta ventana && pause"
    echo Espera a que termine la instalacion y vuelve a ejecutar este script.
    pause
    exit /b
)

REM --- Verificar que node_modules del frontend exista ---
if not exist "%~dp0WinterPosAL\node_modules" (
    echo [Frontend] Instalando dependencias del frontend...
    start "Instalando Frontend" cmd /k "cd /d %~dp0WinterPosAL && npm install && echo INSTALACION COMPLETADA - Cierra esta ventana && pause"
    echo Espera a que termine la instalacion y vuelve a ejecutar este script.
    pause
    exit /b
)

echo [1/2] Iniciando Backend (Express + API + WhatsApp) en puerto 5000...
start "WinterPos - BACKEND :5000" cmd /k "title WinterPos BACKEND ^& cd /d %~dp0backend ^& echo. ^& echo  === BACKEND WINTERPOS === ^& echo  API: http://localhost:5000/api/status ^& echo  WhatsApp se inicializa automaticamente ^& echo. ^& node --watch server.js"

echo Esperando 2 segundos para que el backend arranque...
timeout /t 2 /nobreak >nul

echo [2/2] Iniciando Frontend React/Vite (modo dev con HMR)...
start "WinterPos - FRONTEND Vite" cmd /k "title WinterPos FRONTEND ^& cd /d %~dp0WinterPosAL ^& echo. ^& echo  === FRONTEND WINTERPOS (VITE DEV) === ^& echo. ^& npm run dev"

echo.
echo ====================================================
echo  WINTERPOS EN MODO DESARROLLO INICIADO
echo.
echo  Backend  -> http://localhost:5000
echo  Frontend -> http://localhost:5173
echo.
echo  Las dos terminales se abriran en ventanas separadas.
echo  El frontend tiene recarga en caliente (HMR).
echo  El backend se reinicia automaticamente al guardar.
echo.
echo  Para detener: cierra las dos ventanas de terminal.
echo ====================================================
echo.
pause
