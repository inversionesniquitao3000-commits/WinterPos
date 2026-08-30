@echo off
title Reiniciar Servidor WinterPos
echo ====================================================
echo    REINICIANDO SERVICIO WINTERPOS EN SEGUNDO PLANO
echo ====================================================
echo.
echo Cerrando procesos Node previos...
taskkill /F /IM node.exe >nul 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Iniciando servidor nuevamente en segundo plano...
start "" wscript.exe "%~dp0Iniciar_Servicio_Fondo.vbs"
echo.
echo ====================================================
echo   Servidor reiniciado con exito.
echo ====================================================
timeout /t 3
