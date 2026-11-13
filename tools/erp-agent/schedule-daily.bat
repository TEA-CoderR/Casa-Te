@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%ERP_MYSQL_PASSWORD%"=="" (echo 还没设置数据库密码，请先双击 2_设置密码.bat & pause & exit /b 1)
if "%ERP_SYNC_SECRET%"=="" (echo 还没有同步密钥，请先双击 4_生成同步密钥.bat & pause & exit /b 1)
echo 正在创建 Windows 定时任务 CasaTe-ERP-Sync：每天 07:00 自动运行同步（电脑关机错过的话，开机后补跑一次）
powershell -NoProfile -ExecutionPolicy Bypass -Command "$a = New-ScheduledTaskAction -Execute '%~dp0sync-daily.bat' -WorkingDirectory '%~dp0'; $t = New-ScheduledTaskTrigger -Daily -At 07:00; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew; Register-ScheduledTask -TaskName 'CasaTe-ERP-Sync' -Action $a -Trigger $t -Settings $s -Description 'CASA & TE: ERP prezzi/promo/stock -> negozio online' -Force | Out-Null"
if errorlevel 1 (echo. & echo 创建失败，看上面的错误。) else (echo. & echo 已创建。每天 07:00 自动同步，结果写在 logs\sync.log。& echo 想马上试一次：在“任务计划程序”里右键 CasaTe-ERP-Sync → 运行。& echo 取消：双击 取消定时同步.bat)
pause
