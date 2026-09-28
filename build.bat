@echo off
REM Refreshes the copy of the knowledge base embedded in web\index.html.
REM Run this after editing anything in kb\, if you open the page directly.
cd /d "%~dp0"
python build.py
pause
