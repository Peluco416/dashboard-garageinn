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

echo  Encerrando processos anteriores (se houver)...
call pm2 delete dashboard-garageinn-server dashboard-garageinn-sync >nul 2>&1

echo  Iniciando servidor + monitor de e-mails (via PM2)...
call pm2 start ecosystem.config.cjs

echo.
echo  Tudo iniciado!
echo.
echo  Dashboard local:   http://localhost:5000
echo  Dashboard online:  https://dashboard-garageinn-production.up.railway.app
echo.
echo  Login: admin
echo  Senha: Admin@2026
echo.
echo  Monitor de vendas rodando em segundo plano via PM2 (reinicia sozinho se travar).
echo  Novas vendas sao capturadas a cada 3 minutos automaticamente.
echo  Para ver logs:      pm2 logs dashboard-garageinn-sync
echo  Para ver status:    pm2 status
echo.
echo  Esta janela pode ser fechada — os processos continuam rodando em segundo plano.
echo.
pause
