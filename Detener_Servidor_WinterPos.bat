@echo off
title Detener Servidor WinterPos
echo ====================================================
echo    DETENIENDO SERVICIO WINTERPOS
echo ====================================================
echo.
taskkill /F /IM node.exe
echo.
echo Servidor detenido con exito.
timeout /t 3
