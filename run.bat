@echo off
REM Serves this folder so index.html can load kb.pl live, then opens it.
REM If Python is not installed, just double-click index.html instead.
cd /d "%~dp0"
start "" http://localhost:8000/index.html
python -m http.server 8000
