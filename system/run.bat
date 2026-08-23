@echo off
title Jiguur Zam - Udirdlagiin sistem
cd /d "%~dp0backend"

echo.
echo   JIGUUR ZAM - UDIRDLAGIIN SISTEM
echo   ================================
echo.
echo   [1/2] Sanguudyg shalgaj baina...
python -m pip install -r requirements.txt -q --disable-pip-version-check
if errorlevel 1 (
  echo.
  echo   ALDAA: Python oldsongui esvel sanguud suulgagdsangui.
  echo   python.org-oos Python suulgaad "Add to PATH"-yg chagtalna uu.
  pause
  exit /b 1
)

echo   [2/2] Server asaaj baina...
echo.
echo   ENE KOMPYUTER DEER:      http://localhost:8000
echo.
echo   BUSAD KOMPYUTER/UTASNAAS (neg WiFi/setees):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%b in ("%%a") do echo        http://%%b:8000
)
echo.
echo   Zogsooh: ene tsonhyg haah esvel Ctrl+C
echo   ================================
echo.

start "" http://localhost:8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir "%~dp0backend"
pause
