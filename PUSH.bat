@echo off
title Jiguur - GitHub ruu tulhekh
cd /d "%~dp0"

echo.
echo   JIGUUR ZAM - GITHUB RUU TULHEKH
echo   ================================
echo   Repo: https://github.com/Ulz11/jiguur.git
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo   ALDAA: Git suulgagdaagui baina.
  echo   git-scm.com-oos suulgaad ene faily dahin ajilluulna uu.
  pause
  exit /b 1
)

rem --- Emkhtgesen .git-g tsevelekh (Claude-iin uldeel) ---
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>nul

if not exist ".git\HEAD" (
  git init
)

git config user.name  "Ulz11"
git config user.email "ulziibadrakhtseren@gmail.com"

echo   [1/4] Failuudyg nemj baina...
git add -A

echo   [2/4] Commit hiij baina...
git commit -m "Jiguur Zam - udirdlagiin sistem v1.1" 2>nul
if errorlevel 1 echo        (uurchlult baihgui - commit alggasav)

echo   [3/4] Remote tohiruulj baina...
git remote remove origin >nul 2>nul
git remote add origin https://github.com/Ulz11/jiguur.git
git branch -M main

echo   [4/4] Tulhej baina... (GitHub neverekh tsonh garch irj magadgui)
git push -u origin main
if errorlevel 1 (
  echo.
  echo   TULHEH AMJILTGUI. Bolomjit shaltgaan:
  echo    - GitHub neverelt hiigdeegui  ^(Personal Access Token asuuna^)
  echo    - Repo deer omno ni oruulsan zuil baigaa - dooroh komand:
  echo         git push -u origin main --force
  echo.
) else (
  echo.
  echo   AMJILTTAI! https://github.com/Ulz11/jiguur
  echo.
)
pause
