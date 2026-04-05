FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Docker environment: use host.docker.internal to reach host services
ENV LLAMA_HOST=host.docker.internal
ENV OLLAMA_HOST=host.docker.internal
ENV OCR_HOST=pp-ocr-service
ENV ENV_FILE_PATH=/app/.env

# Expose port
EXPOSE 8777

# Run the application
CMD ["uvicorn", "ollama_api_server:app", "--host", "0.0.0.0", "--port", "8777", "--timeout-keep-alive", "120", "--log-level", "info"]
