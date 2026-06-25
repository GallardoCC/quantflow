@echo off
title QuantFlow
echo ============================================
echo   QuantFlow - arrancando localhost
echo ============================================
echo.

REM --- Liberar el puerto 8000 si quedo un backend zombie de antes ---
REM (uvicorn sin --reload evita workers huerfanos; igual limpiamos por si acaso)
echo Liberando puerto 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo   matando PID %%a en puerto 8000
    taskkill /F /PID %%a >nul 2>&1
)

echo Arrancando backend (sin --reload, para no dejar zombies)...
start "QuantFlow API" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --port 8000 --host 0.0.0.0"
timeout /t 3 /nobreak >nul
start "QuantFlow UI" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Backend: http://localhost:8000  (docs en /docs)
echo Frontend: http://localhost:5173
echo.
echo Cierra esta ventana cuando termines.
pause
