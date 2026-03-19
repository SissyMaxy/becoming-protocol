@echo off
echo === BP Auto-Poster: Windows Task Scheduler Setup ===
echo.
echo This creates a scheduled task that runs the auto-poster on system startup.
echo.

set SCRIPT_DIR=%~dp0
set NODE_PATH=node

:: Create the task to run on logon
schtasks /create /tn "BP-AutoPoster" /tr "cmd /c cd /d %SCRIPT_DIR% && npm start" /sc onlogon /rl highest /f

if %errorlevel%==0 (
    echo.
    echo Task created: BP-AutoPoster
    echo It will start automatically when you log in.
    echo.
    echo To start it now:  npm start
    echo To remove it:     schtasks /delete /tn "BP-AutoPoster" /f
) else (
    echo.
    echo Failed to create task. Try running as administrator.
)

pause
