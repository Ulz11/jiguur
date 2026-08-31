@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
title Jiguur - Bodit data ruu shiljih
cd /d "%~dp0backend"
echo.
echo  JIGUUR - BODIT DATA RUU SHILJIH
echo  ================================
echo  Ene ni odoogiin DB-g TSEVERLEJ, Numbers failuudaas gargasan
echo  bodit datag achaalna: 39 hariltsagch, 8 idevkhtei geree,
echo  noots 63,695sh, 10 zeel, 25 barter.
echo.
set /p CONFIRM="Urgeljluulekh uu? (Y/N): "
if /i not "%CONFIRM%"=="Y" exit /b
python -m pip install -r requirements.txt -q
python -m app.migrate --fresh
echo.
echo  Duuslaa! Odoo run.bat-aar servereee asaagaarai.
pause
