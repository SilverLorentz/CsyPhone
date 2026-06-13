@echo off
chcp 65001 >nul
cd /d %~dp0

echo ====================
echo 正在同步到 GitHub ...
echo ====================
echo.

:: 拉取最新远程变更
git pull origin cloudflare-deploy --rebase --autostash
if %ERRORLEVEL% NEQ 0 (
    echo [警告] Pull 失败
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
    echo.
    echo ====================
    echo 推送成功！
    echo ====================
) else (
    echo.
    echo [错误] 推送失败！
    echo.
    echo 可能原因：
    echo 1. GitHub 连接不通（443端口被屏蔽）
    echo 2. 解决方法：改用 SSH 推送
    echo.
    echo 如需改用 SSH 方式，请运行以下命令：
    echo   git remote set-url origin git@github.com:SilverLorentz/CsyPhone.git
    echo.
    echo 或者手动执行以下命令：
    echo   git push origin cloudflare-deploy
)

echo.
pause