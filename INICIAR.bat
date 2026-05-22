@echo off
title GarageINN Dashboard - Servidor Local
color 0A
cls
echo.
echo  ==========================================
echo   DASHBOARD VENDAS ONLINE - GarageINN
echo   Servidor Local
echo  ==========================================
echo.

cd /d "%~dp0"

echo  Iniciando servidor...
start /b node backend/app.js

timeout /t 3 /nobreak >nul

echo  Iniciando monitor de e-mails (continuo)...
start /b node --use-system-ca backend/sync_continuo.js

echo.
echo  Tudo iniciado!
echo.
echo  Dashboard local:   http://localhost:5000
echo  Dashboard online:  https://dashboard-garageinn-production.up.railway.app
echo.
echo  Login: admin
echo  Senha: Admin@2026
echo.
echo  Monitor de vendas rodando em segundo plano.
echo  Novas vendas sao capturadas a cada 3 minutos automaticamente.
echo.
echo  MANTENHA ESTA JANELA ABERTA.
echo  Para encerrar, feche esta janela.
echo.
pause
