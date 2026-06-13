@echo off
chcp 65001 >nul
cd /d %~dp0

echo ====================
echo 正在同步到 GitHub ...
echo ====================
echo.

git add .
git commit -m "Auto backup: %date% %time%"

git push origin cloudflare-deploy
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================
    echo 推送成功！
    echo ====================
) else (
    echo.
    echo 推送失败，请手动运行命令重试：
    echo   git push origin cloudflare-deploy
)

echo.
pause