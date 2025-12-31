@echo off
echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Starting Ollama API Gateway...
python ollama_api_server.py