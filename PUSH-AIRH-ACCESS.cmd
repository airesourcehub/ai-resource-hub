@echo off
cd /d "%~dp0"
set "LOG=%~dp0_push_access_log.txt"
echo ==== AIRH support tickets push %DATE% %TIME% ==== > "%LOG%"
if exist ".git\stale-maintenance-lock-1" echo (old lock moved aside) >> "%LOG%"
git add about.html auth.html privacy-policy.html js/supabase-config.js >> "%LOG%" 2>&1
git commit -m "Support: Help button on every page (tickets go to the crisspofficial.com admin Support inbox); email links replaced with support tickets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01EqmyL4vE6MQRJsQ9DBhyxw" >> "%LOG%" 2>&1
echo [commit exit %errorlevel%] >> "%LOG%"
git pull --no-edit --no-rebase https://airesourcehub@github.com/airesourcehub/ai-resource-hub.git main >> "%LOG%" 2>&1
echo [pull exit %errorlevel%] >> "%LOG%"
git push https://airesourcehub@github.com/airesourcehub/ai-resource-hub.git HEAD:main >> "%LOG%" 2>&1
echo [push exit %errorlevel%] >> "%LOG%"
git log --oneline -1 >> "%LOG%" 2>&1
echo ==== done ==== >> "%LOG%"
type "%LOG%"
