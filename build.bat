@echo off
REM Refreshes the copy of kb.pl embedded in index.html.
REM Run this after editing kb.pl, if you open index.html directly.
cd /d "%~dp0"
python build.py
pause
