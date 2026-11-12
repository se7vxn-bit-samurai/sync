@echo off
setlocal
cd /d "%~dp0"
node build\preview.js
if errorlevel 1 pause
