@echo off
title GarageINN Dashboard
color 0B
echo.
echo  ============================================
echo   DASHBOARD VENDAS ONLINE - GarageINN
echo  ============================================
echo.
echo  Iniciando servidor...

:: Mata processos antigos
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Inicia o servidor em background
start /b node backend/app.js

:: Aguarda servidor subir
timeout /t 3 /nobreak >nul

echo  Servidor OK!
echo.
echo  Abrindo acesso externo...

:: Inicia tunnel em background e captura URL
node tunnel_start.js

pause
