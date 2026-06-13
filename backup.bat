@echo off
cd /d %~dp0

:: 拉取最新远程变更
git pull origin cloudflare-deploy --rebase --autostash
if %ERRORLEVEL% NEQ 0 (
    echo [警告] Pull 失败，尝试强行推送...
)

:: 添加所有变更
git add .

:: 提交（如果无变更则不提交）
git commit -m "Auto backup: %date% %time%"
if %ERRORLEVEL% EQU 0 (
    echo 提交成功，正在推送...
) else (
    echo 没有需要提交的变更。
)

:: 推送
git push origin cloudflare-deploy
if %ERRORLEVEL% EQU 0 (
    echo 推送成功！
) else (
    echo [错误] 推送失败，请检查网络！
)

echo.
echo ====================
echo 同步完成！
echo ====================
pause