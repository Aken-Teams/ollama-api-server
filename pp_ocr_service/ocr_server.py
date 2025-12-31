"""
PP-OCRv5 API Server
基於 PaddleOCR 的文字辨識服務
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
import time
import io
import base64
from typing import Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PP-OCRv5 API",
    description="基於 PaddleOCR 的高精度文字辨識服務",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全域 OCR 引擎
ocr_engine = None

def get_ocr_engine():
    """延遲載入 OCR 引擎"""
    global ocr_engine
    if ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
            # 使用 PP-OCRv5 模型（最新版本）
            # lang: 支援中英文
            # use_angle_cls: 啟用文字方向分類
            # 注意：新版 PaddleOCR 已移除 use_gpu 參數，會自動檢測
            ocr_engine = PaddleOCR(lang='ch', use_angle_cls=True)
            logger.info("PaddleOCR engine loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load PaddleOCR: {e}")
            raise
    return ocr_engine


@app.get("/")
async def root():
    """API 資訊"""
    return {
        "name": "PP-OCRv5 API",
        "version": "1.0.0",
        "description": "基於 PaddleOCR 的高精度文字辨識服務",
        "endpoints": {
            "/health": "GET - 健康檢查",
            "/ocr/recognize": "POST - OCR 文字辨識",
            "/ocr/recognize/base64": "POST - Base64 圖片 OCR",
            "/docs": "GET - API 文件 (Swagger UI)"
        }
    }


@app.get("/health")
async def health_check():
    """健康檢查"""
    try:
        # 嘗試載入 OCR 引擎
        get_ocr_engine()
        return {"status": "healthy", "model_loaded": True, "engine": "PaddleOCR"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "model_loaded": False, "error": str(e)}
        )


@app.post("/ocr/recognize")
async def ocr_recognize(
    file: UploadFile = File(...),
    model: str = Form("pp-ocrv5"),
    language: str = Form("auto")
):
    """
    OCR 文字辨識

    - file: 圖片檔案 (JPG, PNG, BMP, etc.)
    - model: OCR 模型 (pp-ocrv5, general-ocr, table-ocr, invoice-ocr)
    - language: 語言設定 (auto, zh, en, etc.)
    """
    start_time = time.time()

    try:
        # 讀取圖片
        content = await file.read()

        # 驗證檔案類型
        content_type = file.content_type or ""
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Only image files are supported")

        # 執行 OCR
        ocr = get_ocr_engine()

        # PaddleOCR 接受 bytes 或檔案路徑
        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(content))
        # 轉換為 RGB（如果是 RGBA 或其他格式）
        if image.mode != 'RGB':
            image = image.convert('RGB')

        img_array = np.array(image)

        # 執行辨識
        result = ocr.ocr(img_array)

        # 解析結果
        text_lines = []
        total_confidence = 0
        box_count = 0

        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2:
                    box = line[0]  # 文字框座標
                    text_info = line[1]  # (文字, 信心度)
                    if text_info and len(text_info) >= 2:
                        text = text_info[0]
                        confidence = text_info[1]
                        text_lines.append({
                            "text": text,
                            "confidence": float(confidence),
                            "box": box
                        })
                        total_confidence += confidence
                        box_count += 1

        # 組合文字
        full_text = "\n".join([item["text"] for item in text_lines])
        avg_confidence = total_confidence / box_count if box_count > 0 else 0

        processing_time = time.time() - start_time

        return JSONResponse(content={
            "success": True,
            "text": full_text,
            "confidence": round(avg_confidence, 4),
            "char_count": len(full_text),
            "line_count": len(text_lines),
            "details": text_lines,
            "processing_time_ms": round(processing_time * 1000, 2),
            "model": model,
            "language": language
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@app.post("/ocr/recognize/base64")
async def ocr_recognize_base64(
    image_base64: str = Form(...),
    model: str = Form("pp-ocrv5"),
    language: str = Form("auto")
):
    """
    Base64 圖片 OCR 辨識

    - image_base64: Base64 編碼的圖片
    - model: OCR 模型
    - language: 語言設定
    """
    start_time = time.time()

    try:
        # 解碼 Base64
        # 移除可能的 data URL 前綴
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]

        image_data = base64.b64decode(image_base64)

        # 執行 OCR
        ocr = get_ocr_engine()

        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(image_data))
        if image.mode != 'RGB':
            image = image.convert('RGB')

        img_array = np.array(image)
        result = ocr.ocr(img_array)

        # 解析結果
        text_lines = []
        total_confidence = 0
        box_count = 0

        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2:
                    text_info = line[1]
                    if text_info and len(text_info) >= 2:
                        text = text_info[0]
                        confidence = text_info[1]
                        text_lines.append(text)
                        total_confidence += confidence
                        box_count += 1

        full_text = "\n".join(text_lines)
        avg_confidence = total_confidence / box_count if box_count > 0 else 0

        processing_time = time.time() - start_time

        return JSONResponse(content={
            "success": True,
            "text": full_text,
            "confidence": round(avg_confidence, 4),
            "char_count": len(full_text),
            "processing_time_ms": round(processing_time * 1000, 2),
            "model": model
        })

    except Exception as e:
        logger.error(f"OCR error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8132)
