@echo off
chcp 65001 >nul
schtasks /delete /tn "CasaTe-ERP-Sync" /f
if errorlevel 1 (echo 没有找到定时任务，或删除失败。) else (echo 已取消每日定时同步。手动同步仍然可以双击 同步.bat。)
pause
