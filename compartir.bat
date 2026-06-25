@echo off
title QuantFlow - COMPARTIR (tunel publico)
echo ============================================
echo   QuantFlow - publicar con link de internet
echo ============================================
echo.

REM --- Liberar el puerto 8000 si quedo un backend zombie de antes ---
echo Liberando puerto 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo   matando PID %%a en puerto 8000
    taskkill /F /PID %%a >nul 2>&1
)

echo Arrancando backend (sin --reload, para no dejar zombies)...
start "QuantFlow API" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --port 8000 --host 0.0.0.0"
timeout /t 3 /nobreak >nul

echo Arrancando frontend...
start "QuantFlow UI" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 6 /nobreak >nul

REM --- Localizar cloudflared (PATH o ruta de winget) ---
set "CFLARED=cloudflared"
where cloudflared >nul 2>&1
if errorlevel 1 set "CFLARED=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"

echo.
echo ============================================
echo   Abriendo tunel publico de Cloudflare...
echo   COPIA el link https://....trycloudflare.com
echo   que aparece abajo y compartelo.
echo ============================================
echo.
echo   (Manten esta ventana ABIERTA mientras compartes.
echo    Al cerrarla, el link deja de funcionar.)
echo.

"%CFLARED%" tunnel --url http://localhost:5173

pause
