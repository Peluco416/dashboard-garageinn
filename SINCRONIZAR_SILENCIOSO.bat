@echo off
cd /d "%~dp0"
node --use-system-ca backend\sync_emails.js >> "%~dp0sync_log.txt" 2>&1
