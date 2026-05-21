@echo off
title GarageINN - Sincronizando E-mails
color 0B
cls
echo.
echo  ==========================================
echo   GARAGEINN - SINCRONIZADOR DE E-MAILS
echo  ==========================================
echo.
echo  Abrindo Chrome e lendo novos pedidos...
echo  Aguarde, isso pode levar 30-60 segundos.
echo.

cd /d "%~dp0"
node backend/sync_emails.js

echo.
echo  Sincronizacao concluida!
echo  Feche esta janela.
echo.
pause
