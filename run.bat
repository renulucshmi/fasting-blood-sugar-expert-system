@echo off
REM Serves the project so the page can load kb\*.pl live, then opens it.
REM If Python is not installed, just double-click web\index.html instead.
cd /d "%~dp0"
start "" http://localhost:8000/web/index.html
python -m http.server 8000
