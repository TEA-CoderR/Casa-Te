@echo off
rem Run by the Windows scheduled task "CasaTe-ERP-Sync" (no window prompts, output goes to logs\sync.log).
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs
for %%F in (logs\sync.log) do if %%~zF GTR 5000000 move /y logs\sync.log logs\sync.old.log >nul
echo ===== %date% %time% >> logs\sync.log
node agent.mjs --once >> logs\sync.log 2>&1
echo ===== exit %errorlevel% >> logs\sync.log
