@echo off
title GarageINN - Instalar Agendamento Automático
echo.
echo  Instalando tarefa agendada para sincronizar e-mails a cada 15 minutos...
echo.

set PASTA=%~dp0
set PASTA=%PASTA:~0,-1%
set SCRIPT=%PASTA%\backend\sync_emails.js
set BAT=%PASTA%\SINCRONIZAR_SILENCIOSO.bat

:: Criar bat silencioso
(
echo @echo off
echo cd /d "%PASTA%"
echo node backend\sync_emails.js >> "%PASTA%\sync_log.txt" 2^>^&1
) > "%BAT%"

:: Criar tarefa agendada
schtasks /create /tn "GarageINN Sync Emails" /tr "cmd /c \"%BAT%\"" /sc MINUTE /mo 15 /f /rl HIGHEST

if %errorlevel% == 0 (
  echo.
  echo  ==========================================
  echo   AGENDAMENTO INSTALADO COM SUCESSO!
  echo  ==========================================
  echo.
  echo  O dashboard sera atualizado automaticamente
  echo  a cada 15 minutos quando o computador estiver ligado.
  echo.
  echo  Log em: %PASTA%\sync_log.txt
) else (
  echo.
  echo  ERRO ao instalar agendamento.
  echo  Execute como Administrador e tente novamente.
)
echo.
pause
