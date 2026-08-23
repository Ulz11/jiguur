@echo off
title Jiguur - Noots hiih
cd /d "%~dp0backend"
if not exist backups mkdir backups
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DT=%%I
set STAMP=%DT:~0,8%-%DT:~8,4%
copy /y jiguur.db "backups\jiguur-%STAMP%.db" >nul
if exist uploads (
  powershell -nologo -command "Compress-Archive -Path 'uploads\*' -DestinationPath 'backups\uploads-%STAMP%.zip' -Force" 2>nul
)
echo.
echo   Noots hiigdlee: backend\backups\jiguur-%STAMP%.db
echo   Uunig USB esvel Google Drive ruu huulj hadgalaarai!
echo.
dir /b /o-d backups\*.db 2>nul | findstr /n "^" | findstr "^[1-5]:"
echo.
pause
