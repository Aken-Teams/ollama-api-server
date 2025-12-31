FROM python:3.10-slim

WORKDIR /app

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 複製依賴文件
COPY requirements.txt .

# 安裝 Python 依賴
RUN pip install --no-cache-dir -r requirements.txt

# 預先下載 PaddleOCR 模型（加速啟動）
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(lang='ch')"

# 複製應用程式
COPY . .

# 暴露端口
EXPOSE 8132

# 啟動服務
CMD ["uvicorn", "ocr_server:app", "--host", "0.0.0.0", "--port", "8132"]
