@echo off
cd /d "C:\Users\Claudia Peluco\Documents\dashboard-vendas"
node --use-system-ca backend\sync_emails.js >> "C:\Users\Claudia Peluco\Documents\dashboard-vendas\sync_log.txt" 2>&1
