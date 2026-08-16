@echo off
setlocal
cd /d "%~dp0"

echo ====================================================================
echo      WINTERPOS - ASISTENTE DE COMPILACION Y BLINDAJE DE CODIGO
echo ====================================================================
echo.
echo Este asistente preparara los archivos protegidos para el instalador:
echo.
echo   1. Compilacion de Frontend Vite/React (sin sourcemaps).
echo   2. Cifrado y Ofuscacion de Backend en 'dist_backend/'.
echo   3. Aislamiento total de herramientas y claves de licencia.
echo.
echo NOTA: Tu codigo original en 'backend/' permanecera 100%% INTACTO.
echo ====================================================================
echo.

echo [1/2] Compilando Frontend React (Vite)...
call npm --prefix WinterPosAL run build
if %errorlevel% neq 0 (
    echo [ERROR] Error al compilar el Frontend. Revise los mensajes anteriores.
    pause
    exit /b 1
)
echo [OK] Frontend compilado en WinterPosAL/dist/.

echo.
echo [2/2] Generando Backend protegido en dist_backend/...
node tools/protect-backend.js
if %errorlevel% neq 0 (
    echo [ERROR] Error al proteger los modulos del Backend.
    pause
    exit /b 1
)

echo.
echo ====================================================================
echo   [OK] SISTEMA BLINDADO Y LISTO PARA COMPILAR CON INNO SETUP!
echo ====================================================================
echo.
echo Pasos a seguir:
echo   1. Abre Inno Setup Compiler.
echo   2. Abre 'installer\WinterPos_Installer_Completo.iss' (o el que desees).
echo   3. Presiona 'Ctrl + F9' para compilar el instalador (.exe).
echo.
echo Tu codigo fuente original de desarrollo sigue 100%% limpio.
echo ====================================================================
echo.
pause
