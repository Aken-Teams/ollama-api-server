from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Depends, Header
from fastapi.responses import StreamingResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
import os
import requests
import random
import json
import logging
from contextlib import asynccontextmanager
import asyncio
import time
import httpx
from datetime import datetime, date
from collections import defaultdict
import threading
import aiomysql
import secrets
import hashlib
import fitz  # PyMuPDF for PDF to image conversion
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env early so launchd/systemd-style starts pick up the same vars as shell runs
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _fp:
        for _line in _fp:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            _k = _k.strip()
            _v = _v.strip().strip('"').strip("'")
            os.environ.setdefault(_k, _v)

# Configuration
# Auto-detect: use localhost for local execution, host.docker.internal for Docker
_LLAMA_HOST = os.environ.get("LLAMA_HOST", "localhost")
_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "localhost")

OLLAMA_ENDPOINTS = [
    f"http://{_LLAMA_HOST}:21180/v1",
    f"http://{_LLAMA_HOST}:21181/v1",
    f"http://{_LLAMA_HOST}:21182/v1",
    f"http://{_LLAMA_HOST}:21183/v1",
]

# Model to endpoint mapping - each model routes to its specific llama.cpp / MLX server
MODEL_ENDPOINT_MAP = {
    "gpt-oss:120b": f"http://{_LLAMA_HOST}:21180/v1",
    "gemma4:31b": f"http://{_LLAMA_HOST}:21181/v1",
    "Qwen3-Embedding-8B": f"http://{_LLAMA_HOST}:21182/v1",
    "bge-reranker-v2-m3": f"http://{_LLAMA_HOST}:21183/v1",
    "mlx-community/Qwen2.5-1.5B-Instruct-4bit": f"http://{_LLAMA_HOST}:21191/v1",
    "mlx-community/gpt-oss-120b-MXFP4-Q4": f"http://{_LLAMA_HOST}:21192/v1",
    "mlx-community/gemma-3-27b-it-qat-4bit": f"http://{_LLAMA_HOST}:21193/v1",
    "mlx-community/Qwen2.5-VL-7B-Instruct-4bit": f"http://{_LLAMA_HOST}:21194/v1",
}

API_KEY = "paVrIT+XU1NhwCAOb0X4aYi75QKogK5YNMGvQF1dCyo="

# DeepSeek API Configuration
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"]
ENV_FILE_PATH = os.environ.get("ENV_FILE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Vision Model Configuration (Local Ollama)
QWEN_VL_BASE_URL = os.environ.get("QWEN_VL_BASE_URL", f"http://{_OLLAMA_HOST}:11434/v1")
QWEN_VL_MODELS = ["qwen2.5vl:7b"]

# Remote Qwen3-VL OCR Service (GPU)
QWEN_VL_OCR_URL = os.environ.get("QWEN_VL_OCR_URL", "http://192.168.0.191:8002")

# Local Ollama Models (text models running on local Ollama)
OLLAMA_LOCAL_BASE_URL = os.environ.get("OLLAMA_LOCAL_BASE_URL", f"http://{_OLLAMA_HOST}:11434/v1")
OLLAMA_LOCAL_MODELS = ["gemma3:27b", "gemma4:latest", "nemotron3:33b"]

# Whitelist of models accepted by /v1/chat/completions.
# llama.cpp ignores the `model` field (it serves whatever is loaded), so without
# this guard any garbage string would silently route to a random llama.cpp endpoint.
# "auto" / "agent" are virtual aliases for the LLM router (see route_for_agent).
AGENT_VIRTUAL_MODELS = {"auto", "agent"}
KNOWN_CHAT_MODELS = (
    set(MODEL_ENDPOINT_MAP.keys())
    | set(DEEPSEEK_MODELS)
    | set(QWEN_VL_MODELS)
    | set(OLLAMA_LOCAL_MODELS)
    | AGENT_VIRTUAL_MODELS
)

# === Agent routing (model="auto") ===
# A small fast model classifies the request, then we forward to the chosen target.
ROUTER_MODEL = "mlx-community/Qwen2.5-1.5B-Instruct-4bit"
ROUTING_TARGETS = {
    "code":      "mlx-community/gpt-oss-120b-MXFP4-Q4",
    "reasoning": "mlx-community/gpt-oss-120b-MXFP4-Q4",
    "vision":    "mlx-community/Qwen2.5-VL-7B-Instruct-4bit",
    "quick":     "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
    "general":   "mlx-community/gemma-3-27b-it-qat-4bit",
}
ROUTER_CLASSIFIER_PROMPT = (
    "Classify the user request into ONE category. Reply with ONLY the category word.\n\n"
    "Categories:\n"
    "- code: programming, debugging, code review, software engineering\n"
    "- reasoning: math, logic, step-by-step analysis, complex problem solving\n"
    "- quick: short greeting or simple factual lookup (under one sentence)\n"
    "- general: writing, knowledge, summarization, casual chat, anything else\n\n"
    "User: {prompt}\n\n"
    "Category:"
)

# Speech-to-Text API Configuration
SPEECH_API_BASE_URL = os.environ.get("SPEECH_API_BASE_URL", f"http://{_OLLAMA_HOST}:8131")

# OCR Configuration
_OCR_HOST = os.environ.get("OCR_HOST", "localhost")
OCR_API_BASE_URL = os.environ.get("OCR_API_BASE_URL", f"http://{_OCR_HOST}:8132")
DEEPSEEK_OCR_BASE_URL = os.environ.get("DEEPSEEK_OCR_BASE_URL", "http://192.168.0.191:8001")
PADDLEOCR_REMOTE_URL = os.environ.get("PADDLEOCR_REMOTE_URL", "http://192.168.0.191:8866")
OCR_MODELS = {
    "llava-ocr": {
        "name": "LLaVA 7B OCR",
        "type": "local",
        "description": "本地視覺模型，使用 AI 進行智能文字辨識",
        "features": ["AI 智能辨識", "支援多語言", "理解上下文", "本地處理"],
        "best_for": "一般文件、手寫辨識、複雜版面"
    },
    "pp-ocrv5": {
        "name": "PP-OCRv5",
        "type": "external",
        "description": "PaddleOCR 最新版本，業界領先的高精度 OCR 引擎",
        "features": ["超高精度", "80+ 語言支援", "版面分析", "表格辨識", "手寫辨識"],
        "best_for": "高精度需求、多語言文件、複雜版面、表格文件"
    },
    "general-ocr": {
        "name": "通用 OCR",
        "type": "external",
        "description": "高精度通用文字辨識引擎",
        "features": ["高精度", "快速處理", "批量支援", "多格式"],
        "best_for": "印刷文件、清晰圖片、標準文件"
    },
    "table-ocr": {
        "name": "表格 OCR",
        "type": "external",
        "description": "專門針對表格結構的辨識引擎",
        "features": ["表格結構保留", "欄位對齊", "Excel 匯出", "複雜表格"],
        "best_for": "表格、報表、財務文件"
    },
    "invoice-ocr": {
        "name": "發票 OCR",
        "type": "external",
        "description": "發票和收據專用辨識引擎",
        "features": ["發票格式", "金額辨識", "稅號提取", "結構化輸出"],
        "best_for": "發票、收據、帳單"
    },
    "paddleocr-remote": {
        "name": "PaddleOCR (遠端 GPU)",
        "type": "paddleocr_remote",
        "description": "192.168.0.191:8866 上的 PaddleOCR Serving，GPU 加速，輸出含逐字信心度",
        "features": ["GPU 加速", "逐段信心度", "中英文", "印刷文字"],
        "best_for": "一般印刷文件、掃描文件、多語言文件"
    },
    "deepseek-ocr": {
        "name": "DeepSeek OCR",
        "type": "deepseek",
        "description": "DeepSeek 視覺模型驅動的高精度 OCR，支援 GPU 加速",
        "features": ["GPU 加速", "高精度辨識", "多語言支援", "智能版面分析", "自訂提示詞"],
        "best_for": "複雜文件、手寫辨識、多語言混排、需要高精度的場景"
    },
}

# Models to hide from the list (embedding/reranker models)
HIDDEN_MODELS = [
    "Qwen3-Embedding-8B",
    "bge-reranker-v2-m3",
]

# Model descriptions and features
MODEL_INFO = {
    # 地端模型 (Local Models)
    "gpt-oss:120b": {
        "name": "GPT-OSS 120B",
        "type": "local",
        "description": "大型通用語言模型，適合複雜推理和創意寫作",
        "features": ["120B 參數", "超強推理能力", "多語言支援", "長文本理解"],
        "best_for": "複雜問答、程式碼生成、創意寫作、深度分析",
        "context_length": "131K tokens"
    },
    "gemma4:31b": {
        "name": "Gemma 4 31B-It (llama.cpp)",
        "type": "local",
        "description": "Google Gemma 4 指令微調版，支援思考鏈與多模態（mmproj）",
        "features": ["31B 參數", "Reasoning 模式", "多模態 mmproj", "Q4_K_M 量化"],
        "best_for": "推理問答、複雜指令、視覺輔助對話",
        "context_length": "8K tokens"
    },
    "gemma4:latest": {
        "name": "Gemma 4 (Ollama 預設)",
        "type": "local",
        "provider": "Ollama",
        "description": "Ollama 內建的 Gemma 4 預設量化版，啟動快、資源消耗低",
        "features": ["輕量量化 ~9.6GB", "Ollama 即用", "通用對話", "多語言"],
        "best_for": "日常對話、快速問答、本機輕量場景",
        "context_length": "8K tokens"
    },
    "gemma3:27b": {
        "name": "Gemma 3 27B (視覺)",
        "type": "local",
        "provider": "Ollama",
        "description": "Google Gemma 3 27B 多模態模型，支援圖文理解、長上下文",
        "features": ["27B 參數", "視覺能力", "Q4_K_M", "131K 長上下文"],
        "best_for": "圖片解讀、長文檔分析、多模態應用",
        "context_length": "131K tokens"
    },
    "nemotron3:33b": {
        "name": "Nemotron 3 33B Omni (視覺)",
        "type": "local",
        "provider": "Ollama",
        "description": "NVIDIA Nemotron 3 Omni — 33B 多模態模型，支援文字＋影像，128K 上下文",
        "features": ["33B 參數", "多模態（文字＋影像）", "128K 長上下文", "NVIDIA 訓練"],
        "best_for": "視覺問答、長文檔推理、跨模態任務、NVIDIA 生態整合",
        "context_length": "128K tokens"
    },
    "mlx-community/Qwen2.5-1.5B-Instruct-4bit": {
        "name": "Qwen 2.5 1.5B (MLX)",
        "type": "local",
        "provider": "MLX",
        "description": "Apple MLX 加速的小型 Qwen 模型，啟動極快、超低延遲，適合即時／嵌入式場景",
        "features": ["1.5B 參數", "4-bit 量化 ~839MB", "Apple Silicon 原生加速", "極低延遲"],
        "best_for": "即時對話、命名實體擷取、輕量分類、低成本任務",
        "context_length": "32K tokens"
    },
    "mlx-community/gpt-oss-120b-MXFP4-Q4": {
        "name": "GPT-OSS 120B (MLX)",
        "type": "local",
        "provider": "MLX",
        "description": "GPT-OSS 120B 的 Apple MLX 版本（MXFP4-Q4），相較 llama.cpp Metal 通常快 1.3–2x，記憶體更穩",
        "features": ["120B 參數", "MXFP4-Q4 量化", "Apple Silicon 原生加速", "高吞吐"],
        "best_for": "大模型推理、複雜問答、程式碼生成（M3 Ultra 高效運行）",
        "context_length": "131K tokens"
    },
    "mlx-community/gemma-3-27b-it-qat-4bit": {
        "name": "Gemma 3 27B (MLX, QAT 4-bit)",
        "type": "local",
        "provider": "MLX",
        "description": "Gemma 3 27B 的 Apple MLX 版本，使用 QAT 4-bit 量化（量化感知訓練），4-bit 下品質接近 bf16",
        "features": ["27B 參數", "QAT 4-bit 量化", "視覺能力", "Apple Silicon 原生加速"],
        "best_for": "本地大模型對話、長文檔分析、視覺理解",
        "context_length": "131K tokens"
    },
    "mlx-community/Qwen2.5-VL-7B-Instruct-4bit": {
        "name": "Qwen 2.5 VL 7B (MLX-VLM)",
        "type": "local",
        "provider": "MLX",
        "description": "Qwen2.5-VL 視覺語言模型 MLX 版本，支援圖片理解與 OCR，啟動快、低延遲",
        "features": ["7B 參數", "視覺＋文字", "4-bit 量化 ~5GB", "Apple Silicon 原生加速"],
        "best_for": "圖片問答、文件理解、本地 OCR、視覺 RAG",
        "context_length": "32K tokens"
    },
    "Qwen3-Embedding-8B": {
        "name": "Qwen3 Embedding 8B",
        "type": "local",
        "description": "阿里通義 Qwen3 系列文字嵌入模型，多語言、高品質向量",
        "features": ["8B 參數", "多語言嵌入", "RAG 檢索", "向量相似度"],
        "best_for": "RAG / 知識庫向量化、語意搜尋、文本分群",
        "context_length": "32K tokens"
    },
    "bge-reranker-v2-m3": {
        "name": "BGE Reranker v2 m3",
        "type": "local",
        "description": "BAAI 多語言重排序模型，搭配 embedding 提升檢索精度",
        "features": ["多語言 reranking", "高精度", "輕量快速", "Q8_0 量化"],
        "best_for": "RAG 第二階段重排序、檢索後過濾",
        "context_length": "8K tokens"
    },
    # 雲端模型 - DeepSeek API
    "deepseek-v4-flash": {
        "name": "DeepSeek V4 Flash",
        "type": "cloud",
        "provider": "DeepSeek",
        "description": "DeepSeek V4 系列輕量版，主打低延遲、高吞吐，適合即時互動",
        "features": ["雲端服務", "極速回應", "高吞吐", "成本最低"],
        "best_for": "聊天機器人、即時客服、批次摘要、快速問答",
        "context_length": "128K tokens"
    },
    "deepseek-v4-pro": {
        "name": "DeepSeek V4 Pro",
        "type": "cloud",
        "provider": "DeepSeek",
        "description": "DeepSeek V4 系列旗艦版，推理與寫作能力顯著優於 Flash",
        "features": ["雲端服務", "深度推理", "長文本生成", "程式碼/數學專精"],
        "best_for": "複雜推理、程式碼生成、論文寫作、Agent 任務",
        "context_length": "128K tokens"
    },
    "deepseek-chat": {
        "name": "DeepSeek Chat",
        "type": "cloud",
        "provider": "DeepSeek",
        "description": "DeepSeek 對話模型，高效能雲端 AI 服務",
        "features": ["雲端服務", "快速回應", "高效能", "穩定可靠"],
        "best_for": "一般對話、文本生成、翻譯、摘要",
        "context_length": "64K tokens"
    },
    "deepseek-reasoner": {
        "name": "DeepSeek Reasoner",
        "type": "cloud",
        "provider": "DeepSeek",
        "description": "DeepSeek 推理模型，專注於邏輯推理和數學",
        "features": ["深度推理", "數學專精", "邏輯分析", "步驟解說"],
        "best_for": "數學題解、邏輯推理、程式除錯、科學計算",
        "context_length": "64K tokens"
    },
}

# Track endpoint health
endpoint_health = {endpoint: True for endpoint in OLLAMA_ENDPOINTS}
deepseek_health = True
qwen_vl_health = True
speech_api_health = True
ocr_api_health = True
deepseek_ocr_health = True  # DeepSeek OCR service health
last_health_check = {}

# MySQL Configuration
MYSQL_CONFIG = {
    "host": "122.100.99.161",
    "port": 43306,
    "user": "A999",
    "password": "1023",
    "db": "db_A999",
    "charset": "utf8mb4",
    "autocommit": True,
}

# MySQL connection pool
db_pool = None

# Security
security = HTTPBearer(auto_error=False)

# Usernames hidden from API key management UI (system accounts)
SYSTEM_USERNAMES = {"zhpjaiaoi"}

# Default admin account
DEFAULT_ADMIN = {
    "username": "zhpjaiaoi",
    "api_key": None,  # Will be generated on first run
    "is_admin": True
}

# Fallback master API key (used when database is unavailable)
MASTER_API_KEY = os.environ.get("MASTER_API_KEY", "pj-admin-zhpjaiaoi-2024")

# Usage log retention (days). Older rows are pruned daily.
USAGE_LOG_RETENTION_DAYS = int(os.environ.get("USAGE_LOG_RETENTION_DAYS", "90"))


def generate_api_key() -> str:
    """Generate a secure random API key"""
    return secrets.token_urlsafe(32)


def hash_api_key(api_key: str) -> str:
    """Hash an API key for secure storage"""
    return hashlib.sha256(api_key.encode()).hexdigest()


def _strip_deepseek_noise(text: str) -> str:
    """Remove debug lines (e.g. 'PATCHES: torch.Size(...)') leaked by DeepSeek OCR."""
    lines = (text or "").splitlines()
    cleaned = [ln for ln in lines if not ln.lstrip().startswith(("PATCHES:", "PATCHES："))]
    return "\n".join(cleaned).strip()


async def init_system_users_table():
    """Create system_users table and insert default user if empty"""
    if not db_pool:
        return

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS system_users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(100) UNIQUE NOT NULL,
                        password VARCHAR(255) NOT NULL,
                        is_admin BOOLEAN DEFAULT FALSE,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # Insert default admin user if table is empty
                await cursor.execute("SELECT COUNT(*) FROM system_users")
                (count,) = await cursor.fetchone()
                if count == 0:
                    await cursor.execute(
                        "INSERT INTO system_users (username, password, is_admin) VALUES (%s, %s, %s)",
                        ('aken', '1023', True)
                    )
                    logger.info("Default admin user 'aken' inserted")
                logger.info("system_users table initialized")
    except Exception as e:
        logger.error(f"Failed to create system_users table: {e}")


async def init_user_permissions_table():
    """Create user_permissions table for granular access control"""
    if not db_pool:
        return

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS user_permissions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(100) UNIQUE NOT NULL,
                        allowed_models TEXT NULL COMMENT 'JSON array of allowed model IDs, NULL = all',
                        allowed_features TEXT NULL COMMENT 'JSON array: chat,speech,ocr,embeddings. NULL = all',
                        daily_request_limit INT DEFAULT 0 COMMENT '0 = unlimited',
                        daily_token_limit INT DEFAULT 0 COMMENT '0 = unlimited',
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                """)
                logger.info("user_permissions table initialized")
    except Exception as e:
        logger.error(f"Failed to create user_permissions table: {e}")


async def init_api_keys_table():
    """Create API keys table if not exists"""
    if not db_pool:
        return

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS api_keys (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(100) UNIQUE NOT NULL,
                        api_key_hash VARCHAR(64) NOT NULL,
                        api_key_prefix VARCHAR(8) NOT NULL,
                        is_admin BOOLEAN DEFAULT FALSE,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_used_at TIMESTAMP NULL,
                        request_count INT DEFAULT 0,
                        description VARCHAR(255) NULL
                    )
                """)
                logger.info("API keys table initialized")
    except Exception as e:
        logger.error(f"Failed to create API keys table: {e}")


async def init_usage_logs_table():
    """Create usage_logs table to track per-request API usage"""
    if not db_pool:
        return

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS usage_logs (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(100) NULL,
                        endpoint VARCHAR(255) NOT NULL,
                        method VARCHAR(10) NOT NULL,
                        model VARCHAR(100) NULL,
                        prompt_tokens INT DEFAULT 0,
                        completion_tokens INT DEFAULT 0,
                        total_tokens INT DEFAULT 0,
                        status_code INT NOT NULL,
                        response_time_ms INT DEFAULT 0,
                        ip_address VARCHAR(64) NULL,
                        error_message VARCHAR(500) NULL,
                        request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_username (username),
                        INDEX idx_endpoint (endpoint),
                        INDEX idx_request_at (request_at)
                    )
                """)
                logger.info("usage_logs table initialized")
    except Exception as e:
        logger.error(f"Failed to create usage_logs table: {e}")


async def init_admin_account():
    """Initialize the default admin account if not exists"""
    if not db_pool:
        return None

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Check if admin already exists
                await cursor.execute(
                    "SELECT id, api_key_prefix FROM api_keys WHERE username = %s",
                    (DEFAULT_ADMIN["username"],)
                )
                existing = await cursor.fetchone()

                if existing:
                    logger.info(f"Admin account '{DEFAULT_ADMIN['username']}' already exists (key prefix: {existing['api_key_prefix']}...)")
                    return None

                # Create new admin account
                api_key = generate_api_key()
                api_key_hash = hash_api_key(api_key)
                api_key_prefix = api_key[:8]

                await cursor.execute(
                    """INSERT INTO api_keys (username, api_key_hash, api_key_prefix, is_admin, description)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (DEFAULT_ADMIN["username"], api_key_hash, api_key_prefix, True, "System Administrator")
                )

                logger.info(f"=" * 60)
                logger.info(f"Admin account created!")
                logger.info(f"Username: {DEFAULT_ADMIN['username']}")
                logger.info(f"API Key: {api_key}")
                logger.info(f"Please save this API key securely - it won't be shown again!")
                logger.info(f"=" * 60)

                return api_key
    except Exception as e:
        logger.error(f"Failed to initialize admin account: {e}")
        return None


async def validate_api_key(api_key: str) -> Optional[Dict]:
    """Validate an API key and return user info if valid"""
    if not api_key:
        return None

    # Check master API key first (always works, even without database)
    if api_key == MASTER_API_KEY:
        logger.info(f"Master API key used for authentication")
        return {
            "id": 0,
            "username": "zhpjaiaoi",
            "is_admin": True,
            "is_active": True,
            "request_count": 0,
            "permissions": {"allowed_models": None, "allowed_features": None,
                            "daily_request_limit": 0, "daily_token_limit": 0}
        }

    # If no database pool, only master key works
    if not db_pool:
        return None

    try:
        api_key_hash = hash_api_key(api_key)
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    """SELECT id, username, is_admin, is_active, request_count
                       FROM api_keys WHERE api_key_hash = %s""",
                    (api_key_hash,)
                )
                user = await cursor.fetchone()

                if user and user["is_active"]:
                    # Update last used and request count
                    await cursor.execute(
                        """UPDATE api_keys SET last_used_at = NOW(), request_count = request_count + 1
                           WHERE id = %s""",
                        (user["id"],)
                    )
                    # Load permissions
                    await cursor.execute(
                        """SELECT allowed_models, allowed_features, daily_request_limit, daily_token_limit
                           FROM user_permissions WHERE username = %s""",
                        (user["username"],)
                    )
                    perm = await cursor.fetchone()
                    if perm:
                        user["permissions"] = {
                            "allowed_models": json.loads(perm["allowed_models"]) if perm["allowed_models"] else None,
                            "allowed_features": json.loads(perm["allowed_features"]) if perm["allowed_features"] else None,
                            "daily_request_limit": perm["daily_request_limit"] or 0,
                            "daily_token_limit": perm["daily_token_limit"] or 0,
                        }
                    else:
                        user["permissions"] = {"allowed_models": None, "allowed_features": None,
                                               "daily_request_limit": 0, "daily_token_limit": 0}
                    return user
                return None
    except Exception as e:
        logger.error(f"Failed to validate API key: {e}")
        # Fallback to master key check already done above
        return None


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    authorization: str = Header(None)
) -> Optional[Dict]:
    """Dependency to get current user from API key"""
    api_key = None

    # Try Bearer token first
    if credentials:
        api_key = credentials.credentials
    # Fallback to Authorization header
    elif authorization:
        if authorization.startswith("Bearer "):
            api_key = authorization[7:]
        else:
            api_key = authorization

    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="API Key required. Use Authorization: Bearer <your-api-key>"
        )

    user = await validate_api_key(api_key)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid or inactive API Key"
        )

    # Stash username so the usage-log middleware can pick it up
    if not getattr(request.state, "usage_extra", None):
        request.state.usage_extra = {}
    request.state.usage_extra["username"] = user.get("username")

    return user


async def get_admin_user(user: Dict = Depends(get_current_user)) -> Dict:
    """Dependency to require admin privileges"""
    if not user.get("is_admin"):
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required"
        )
    return user


async def migrate_conversations_table():
    """Add user_id and username columns to ollama_conversations if not exists"""
    if not db_pool:
        return

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                # Check if user_id column exists
                await cursor.execute("""
                    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'ollama_conversations' AND COLUMN_NAME = 'user_id'
                """, (MYSQL_CONFIG["db"],))
                result = await cursor.fetchone()

                if not result:
                    # Add user_id and username columns
                    await cursor.execute("""
                        ALTER TABLE ollama_conversations
                        ADD COLUMN user_id INT DEFAULT NULL,
                        ADD COLUMN username VARCHAR(100) DEFAULT NULL
                    """)
                    logger.info("Added user_id and username columns to ollama_conversations table")
    except Exception as e:
        logger.error(f"Failed to migrate conversations table: {e}")


async def init_db_pool():
    """Initialize MySQL connection pool"""
    global db_pool
    try:
        db_pool = await aiomysql.create_pool(
            host=MYSQL_CONFIG["host"],
            port=MYSQL_CONFIG["port"],
            user=MYSQL_CONFIG["user"],
            password=MYSQL_CONFIG["password"],
            db=MYSQL_CONFIG["db"],
            charset=MYSQL_CONFIG["charset"],
            autocommit=MYSQL_CONFIG["autocommit"],
            minsize=1,
            maxsize=10,
        )
        logger.info("MySQL connection pool initialized")

        # Initialize tables
        await init_system_users_table()
        await init_api_keys_table()
        await init_user_permissions_table()
        await init_usage_logs_table()
        await init_admin_account()

        # Run database migrations
        await migrate_conversations_table()
    except Exception as e:
        logger.error(f"Failed to initialize MySQL pool: {e}")


async def close_db_pool():
    """Close MySQL connection pool"""
    global db_pool
    if db_pool:
        db_pool.close()
        await db_pool.wait_closed()
        logger.info("MySQL connection pool closed")


async def _write_usage_log(
    username, endpoint, method, model,
    prompt_tokens, completion_tokens, total_tokens,
    status_code, response_time_ms, ip_address, error_message
):
    """Insert one row into usage_logs (best-effort, swallow errors)."""
    if not db_pool:
        return
    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    """INSERT INTO usage_logs
                       (username, endpoint, method, model,
                        prompt_tokens, completion_tokens, total_tokens,
                        status_code, response_time_ms, ip_address, error_message)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (username, endpoint, method, model,
                     prompt_tokens or 0, completion_tokens or 0, total_tokens or 0,
                     status_code, response_time_ms, ip_address,
                     (error_message[:500] if error_message else None))
                )
    except Exception as e:
        logger.error(f"Failed to write usage log: {e}")


def record_usage_extra(request: Request, **fields):
    """Endpoints call this to attach business fields (model, tokens, error)
    that the middleware will flush into usage_logs after the response."""
    extra = getattr(request.state, "usage_extra", None)
    if extra is None:
        extra = {}
        request.state.usage_extra = extra
    extra.update({k: v for k, v in fields.items() if v is not None})


async def log_chat_usage(raw_request: Request, user: Dict, model: str,
                         prompt_tokens: int, completion_tokens: int,
                         start_time: float, success: bool,
                         error_message: Optional[str] = None):
    """Write a usage_logs row for a streaming chat response.
    Called from inside the streaming generator after it finishes."""
    elapsed_ms = int((time.time() - start_time) * 1000)
    await _write_usage_log(
        username=(user or {}).get("username"),
        endpoint=str(raw_request.url.path),
        method=raw_request.method,
        model=model,
        prompt_tokens=prompt_tokens or 0,
        completion_tokens=completion_tokens or 0,
        total_tokens=(prompt_tokens or 0) + (completion_tokens or 0),
        status_code=200 if success else 500,
        response_time_ms=elapsed_ms,
        ip_address=(raw_request.client.host if raw_request.client else None),
        error_message=error_message,
    )

class ChatMessage(BaseModel):
    role: str
    content: Union[str, List[Any]]  # 支援純文字或視覺模型的陣列格式

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False
    top_p: Optional[float] = 1.0
    frequency_penalty: Optional[float] = 0
    presence_penalty: Optional[float] = 0

class ModelListResponse(BaseModel):
    object: str = "list"
    data: List[Dict[str, Any]]


async def record_conversation_to_db(model: str, messages: List[Dict], response_content: str,
                                    prompt_tokens: int = 0, completion_tokens: int = 0,
                                    response_time_ms: float = 0, success: bool = True,
                                    user_id: int = None, username: str = None):
    """Record a conversation to MySQL database"""
    if not db_pool:
        logger.warning("Database pool not initialized, skipping record")
        return

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                now = datetime.now()
                today = now.date()
                total_tokens = prompt_tokens + completion_tokens

                # Insert conversation record
                await cursor.execute(
                    """INSERT INTO ollama_conversations
                       (timestamp, model, messages, response, prompt_tokens, completion_tokens,
                        total_tokens, response_time_ms, success, user_id, username)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (now, model, json.dumps(messages, ensure_ascii=False), response_content,
                     prompt_tokens, completion_tokens, total_tokens,
                     round(response_time_ms, 2), success, user_id, username)
                )

    except Exception as e:
        logger.error(f"Failed to record conversation to database: {e}")


def record_conversation(model: str, messages: List[Dict], response_content: str,
                        prompt_tokens: int = 0, completion_tokens: int = 0,
                        response_time_ms: float = 0, success: bool = True,
                        user_id: int = None, username: str = None):
    """Record a conversation (async wrapper)"""
    # Schedule async database write
    asyncio.create_task(record_conversation_to_db(
        model, messages, response_content,
        prompt_tokens, completion_tokens,
        response_time_ms, success,
        user_id, username
    ))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Ollama API Gateway")
    await init_db_pool()
    asyncio.create_task(health_check_loop())
    asyncio.create_task(usage_logs_cleanup_loop())
    yield
    # Shutdown
    logger.info("Shutting down Ollama API Gateway")
    await close_db_pool()

app = FastAPI(title="PJ_API 管理系統", version="1.0.0", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_static_middleware(request: Request, call_next):
    """強制 HTML / 靜態 JS/CSS 不快取，確保前端改動即時生效（也讓 Cloudflare 不快取）。"""
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        # Cloudflare-specific override (CDN edge cache)
        response.headers["CDN-Cache-Control"] = "no-store"
        response.headers["Cloudflare-CDN-Cache-Control"] = "no-store"
    return response


@app.middleware("http")
async def usage_log_middleware(request: Request, call_next):
    """Record one row in usage_logs for every /v1/* and /api/* request."""
    request.state.usage_extra = {}
    start = time.time()
    error_msg = None
    status_code = 500
    response = None
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception as e:
        error_msg = str(e)
        raise
    finally:
        path = request.url.path
        if path.startswith("/v1/") or path.startswith("/api/"):
            extra = request.state.usage_extra or {}
            # Streaming endpoints set _self_log=True and write their own row
            # after the generator finishes (so token totals are captured).
            if not extra.get("_self_log"):
                elapsed_ms = int((time.time() - start) * 1000)
                asyncio.create_task(_write_usage_log(
                    username=extra.get("username"),
                    endpoint=path,
                    method=request.method,
                    model=extra.get("model"),
                    prompt_tokens=extra.get("prompt_tokens", 0),
                    completion_tokens=extra.get("completion_tokens", 0),
                    total_tokens=extra.get("total_tokens", 0),
                    status_code=status_code,
                    response_time_ms=elapsed_ms,
                    ip_address=(request.client.host if request.client else None),
                    error_message=error_msg or extra.get("error_message"),
                ))

async def health_check_loop():
    """Periodically check the health of Ollama endpoints"""
    while True:
        await asyncio.sleep(30)  # Check every 30 seconds
        for endpoint in OLLAMA_ENDPOINTS:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{endpoint}/models",
                        headers={"Authorization": f"Bearer {API_KEY}"},
                        timeout=5
                    )
                    endpoint_health[endpoint] = response.status_code == 200
            except Exception as e:
                endpoint_health[endpoint] = False
                logger.warning(f"Health check failed for {endpoint}: {e}")


async def _prune_usage_logs(days: int) -> int:
    """Delete usage_logs rows older than `days` days. Returns number of rows deleted."""
    if not db_pool or days <= 0:
        return 0
    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM usage_logs WHERE request_at < DATE_SUB(NOW(), INTERVAL %s DAY)",
                    (days,)
                )
                return cur.rowcount or 0
    except Exception as e:
        logger.error(f"Failed to prune usage_logs: {e}")
        return 0


async def usage_logs_cleanup_loop():
    """Once a day, prune usage_logs rows older than USAGE_LOG_RETENTION_DAYS."""
    # Stagger startup so we don't hammer DB at boot
    await asyncio.sleep(60)
    while True:
        try:
            deleted = await _prune_usage_logs(USAGE_LOG_RETENTION_DAYS)
            if deleted:
                logger.info(f"Pruned {deleted} usage_logs rows older than {USAGE_LOG_RETENTION_DAYS} days")
        except Exception as e:
            logger.error(f"usage_logs cleanup error: {e}")
        # Run roughly once a day
        await asyncio.sleep(24 * 60 * 60)

def get_available_endpoint(model: str = None):
    """Get endpoint for a specific model, or random available endpoint if model not specified.

    Args:
        model: The model name to route to. If specified and found in MODEL_ENDPOINT_MAP,
               returns the dedicated endpoint for that model.

    Returns:
        The endpoint URL string, or None if no endpoints available / model unknown.
    """
    # If model is specified and has a dedicated endpoint, use it
    if model and model in MODEL_ENDPOINT_MAP:
        endpoint = MODEL_ENDPOINT_MAP[model]
        # Check if the dedicated endpoint is healthy
        if endpoint_health.get(endpoint, True):
            return endpoint
        # If dedicated endpoint is unhealthy, still return it (let the request fail with proper error)
        logger.warning(f"Dedicated endpoint for model '{model}' ({endpoint}) is unhealthy, but using it anyway")
        return endpoint

    # A model name was given but does not map to any endpoint: refuse rather than
    # silently routing to a random llama.cpp instance. llama.cpp ignores the `model`
    # field and would happily respond with whatever model it has loaded, masking
    # client-side typos like "gpt-4o-mini00000".
    if model:
        return None

    # No model specified: random selection (used by warmup/health probes)
    available = [ep for ep in OLLAMA_ENDPOINTS if endpoint_health.get(ep, True)]

    if not available:
        # If no endpoints are marked as healthy, try all endpoints
        available = OLLAMA_ENDPOINTS

    return random.choice(available) if available else None


def reject_unknown_chat_model(model: Optional[str]):
    """Raise 400 if `model` is not in the chat-capable model set.
    Used at endpoint boundaries so the user sees a clear error instead of a
    503 (or worse, a successful response from llama.cpp ignoring the model)."""
    if not model:
        raise HTTPException(status_code=400, detail="必須指定 model 欄位")
    if model not in KNOWN_CHAT_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"未知的模型 '{model}'。可用模型：{sorted(KNOWN_CHAT_MODELS)}"
        )

async def forward_request(endpoint: str, path: str, method: str, headers: dict, json_data: dict = None, stream: bool = False):
    """Forward request to Ollama endpoint"""
    url = f"{endpoint}{path}"

    # 建立乾淨的請求頭，避免傳遞可能導致問題的頭部（如 Content-Length, Host 等）
    clean_headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    # 大型模型需要更長的超時時間
    timeout_config = httpx.Timeout(
        connect=10.0,      # 連接超時
        read=300.0,        # 讀取超時 (5分鐘，給大型模型足夠時間)
        write=30.0,        # 寫入超時
        pool=10.0          # 連接池超時
    )

    async with httpx.AsyncClient(timeout=timeout_config) as client:
        try:
            if stream:
                # Handle streaming response
                async with client.stream(
                    method,
                    url,
                    headers=clean_headers,
                    json=json_data,
                ) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes():
                        yield chunk
            else:
                # Handle regular response
                response = await client.request(
                    method,
                    url,
                    headers=clean_headers,
                    json=json_data,
                )
                response.raise_for_status()
                yield response.content
        except httpx.HTTPStatusError as e:
            endpoint_health[endpoint] = False
            error_detail = f"HTTP {e.response.status_code}: {e.response.text[:200] if e.response.text else str(e)}"
            raise HTTPException(status_code=e.response.status_code, detail=error_detail)
        except httpx.TimeoutException as e:
            endpoint_health[endpoint] = False
            raise HTTPException(status_code=504, detail=f"請求超時：模型回應時間過長，請稍後再試。錯誤：{str(e)}")
        except Exception as e:
            endpoint_health[endpoint] = False
            raise HTTPException(status_code=500, detail=f"連接錯誤：{str(e)}")

@app.get("/")
async def root():
    """Root endpoint - serve the HTML interface"""
    # Try modular version first, fallback to monolithic
    for path in ["static/index.html", "index.html"]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                html_content = f.read()
            return HTMLResponse(content=html_content)
        except FileNotFoundError:
            continue
    return {
        "message": "Ollama API Gateway",
        "endpoints": len(OLLAMA_ENDPOINTS),
        "healthy_endpoints": sum(1 for v in endpoint_health.values() if v)
    }

# Mount static files for CSS/JS modules
import os
_static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.isdir(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

@app.get("/v1/models")
async def list_models(user: Dict = Depends(get_current_user)):
    """List available models from all endpoints"""
    global deepseek_health
    all_models = set()
    errors = []

    # Get Ollama models
    for endpoint in OLLAMA_ENDPOINTS:
        if not endpoint_health.get(endpoint, True):
            continue

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{endpoint}/models",
                    headers={"Authorization": f"Bearer {API_KEY}"},
                    timeout=5
                )
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, dict) and "data" in data:
                        for model in data["data"]:
                            all_models.add(json.dumps(model, sort_keys=True))
                    endpoint_health[endpoint] = True
        except Exception as e:
            endpoint_health[endpoint] = False
            errors.append(f"Error from {endpoint}: {str(e)}")

    # Get DeepSeek models
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{DEEPSEEK_BASE_URL}/models",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and "data" in data:
                    for model in data["data"]:
                        all_models.add(json.dumps(model, sort_keys=True))
                deepseek_health = True
    except Exception as e:
        deepseek_health = False
        errors.append(f"Error from DeepSeek: {str(e)}")

    # Get Qwen-VL models
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{QWEN_VL_BASE_URL}/models",
                headers={"Authorization": f"Bearer {API_KEY}"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and "data" in data:
                    for model in data["data"]:
                        all_models.add(json.dumps(model, sort_keys=True))
                qwen_vl_health = True
    except Exception as e:
        qwen_vl_health = False
        errors.append(f"Error from Qwen-VL: {str(e)}")

    if not all_models and errors:
        raise HTTPException(status_code=503, detail="All endpoints failed: " + "; ".join(errors))

    # Parse unique models back to dicts and filter hidden models
    unique_models = [json.loads(m) for m in all_models]

    # Inject synthetic entries for any MODEL_ENDPOINT_MAP keys not already
    # discovered (e.g. MLX servers that list multiple cached models — we only
    # want to expose the single one we explicitly route).
    _existing_ids = {m.get("id") for m in unique_models}
    for _mid, _ep in MODEL_ENDPOINT_MAP.items():
        if _mid not in _existing_ids:
            unique_models.append({
                "id": _mid,
                "object": "model",
                "owned_by": "mlx" if "mlx-community" in _mid else "local",
                "created": int(time.time()),
            })

    filtered_models = [m for m in unique_models if m.get("id") not in HIDDEN_MODELS]

    # Add model info/descriptions and type classification
    for model in filtered_models:
        model_id = model.get("id")
        owned_by = model.get("owned_by", "")

        # Add model info if available
        if model_id in MODEL_INFO:
            model["info"] = MODEL_INFO[model_id]

        # Auto-classify model type based on source
        if model_id in DEEPSEEK_MODELS:
            model["deployment_type"] = "cloud"
            model["provider"] = "DeepSeek"
        elif model_id in QWEN_VL_MODELS or model_id in OLLAMA_LOCAL_MODELS:
            model["deployment_type"] = "local"
            model["provider"] = "Ollama"
        elif model_id and ("mlx-community/" in model_id or model.get("owned_by") == "mlx"):
            model["deployment_type"] = "local"
            model["provider"] = "MLX"
        else:
            # Default to local for llama.cpp models
            model["deployment_type"] = "local"
            model["provider"] = "llama.cpp"

    return ModelListResponse(data=filtered_models)

async def forward_to_deepseek(request_data: dict, stream: bool = False):
    """Forward request to DeepSeek API"""
    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        if stream:
            async with client.stream(
                "POST",
                url,
                headers=headers,
                json=request_data,
                timeout=120
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    yield chunk
        else:
            response = await client.post(
                url,
                headers=headers,
                json=request_data,
                timeout=120
            )
            response.raise_for_status()
            yield response.content


def split_harmony_response(content: str):
    """Split a reasoning-style response into (final_answer, reasoning).

    Handles two formats:
    1. <think>reasoning</think>final
    2. gpt-oss harmony:
       <|channel|>analysis<|message|>reasoning<|end|>
       <|start|>assistant<|channel|>final<|message|>final<|return|>

    Either returned value may be "". When the model was cut off mid-reasoning
    and never reached the final channel, final is "" and reasoning holds the
    partial thought — callers can decide whether to surface it.
    """
    import re

    if not content:
        return "", ""

    # <think>...</think>
    if '<think>' in content or '</think>' in content:
        m = re.search(r'<think>(.*?)</think>', content, flags=re.DOTALL)
        reasoning = m.group(1).strip() if m else ''
        final = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        if not final and '</think>' in content:
            tail = content.split('</think>', 1)[1].strip()
            final = tail
        if not reasoning and '<think>' in content and '</think>' not in content:
            reasoning = content.split('<think>', 1)[1].strip()
        return final, reasoning

    # gpt-oss harmony: <|channel|>X<|message|>Y
    if '<|channel|>' in content or '<|message|>' in content:
        analysis = ''
        m = re.search(
            r'<\|channel\|>analysis<\|message\|>(.*?)(?:<\|end\|>|<\|start\|>|<\|channel\|>|$)',
            content, flags=re.DOTALL,
        )
        if m:
            analysis = m.group(1).strip()
        final = ''
        m = re.search(
            r'<\|channel\|>final<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|<\|endoftext\|>|$)',
            content, flags=re.DOTALL,
        )
        if m:
            final = m.group(1).strip()
        return final, analysis

    return content, ""


def clean_deepseek_r1_response(content: str) -> str:
    """Return only the final answer, stripping reasoning. Back-compat shim."""
    final, _reasoning = split_harmony_response(content)
    return final


def _agent_extract_last_user_text(messages) -> str:
    """Pull the last user message as plain text (collapsing multi-part content)."""
    for m in reversed(messages):
        if m.get("role") != "user":
            continue
        content = m.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(
                item.get("text", "") for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            )
    return ""


def _agent_has_vision_content(messages) -> bool:
    for m in messages:
        content = m.get("content")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "image_url":
                    return True
    return False


async def route_for_agent(request_data: dict):
    """Pick a target model for `model: "auto"`. Returns (model_id, route_label).

    Heuristic shortcuts skip the LLM call when the choice is obvious:
    - any image attachment -> vision
    - very short prompts    -> quick

    Otherwise the small Qwen2.5-1.5B classifier picks one of the labels and
    we look it up in ROUTING_TARGETS. Anything weird falls back to general.
    """
    messages = request_data.get("messages", [])

    if _agent_has_vision_content(messages):
        return ROUTING_TARGETS["vision"], "vision"

    last_text = _agent_extract_last_user_text(messages).strip()
    if not last_text:
        return ROUTING_TARGETS["quick"], "quick"
    if len(last_text) < 12:
        return ROUTING_TARGETS["quick"], "quick"

    import re
    classifier_prompt = ROUTER_CLASSIFIER_PROMPT.format(prompt=last_text[:1200])
    endpoint = MODEL_ENDPOINT_MAP.get(ROUTER_MODEL)
    if not endpoint:
        logger.warning("Agent router model not registered, defaulting to general")
        return ROUTING_TARGETS["general"], "general"

    try:
        timeout = httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{endpoint}/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
                json={
                    "model": ROUTER_MODEL,
                    "messages": [{"role": "user", "content": classifier_prompt}],
                    "max_tokens": 8,
                    "temperature": 0.0,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            label = re.split(r"[\s,.\n:]+", raw.strip().lower())[0].strip(".:")
            if label in ROUTING_TARGETS:
                return ROUTING_TARGETS[label], label
    except Exception as e:
        logger.warning(f"Agent router classifier failed, falling back to general: {e}")

    return ROUTING_TARGETS["general"], "general"


def convert_openai_to_ollama_format(request_data: dict) -> dict:
    """Convert OpenAI-style image format to Ollama format"""
    converted_data = request_data.copy()

    if "messages" in converted_data:
        new_messages = []
        for msg in converted_data["messages"]:
            new_msg = {"role": msg.get("role", "user")}
            content = msg.get("content")

            if isinstance(content, list):
                # OpenAI format with content array
                text_parts = []
                images = []

                for item in content:
                    if isinstance(item, dict):
                        if item.get("type") == "text":
                            text_parts.append(item.get("text", ""))
                        elif item.get("type") == "image_url":
                            image_url = item.get("image_url", {})
                            url = image_url.get("url", "") if isinstance(image_url, dict) else ""
                            # Extract base64 data from data URL
                            if url.startswith("data:"):
                                # Format: data:image/png;base64,XXXXX
                                if ";base64," in url:
                                    base64_data = url.split(";base64,")[1]
                                    images.append(base64_data)
                            else:
                                # Regular URL - keep as is
                                images.append(url)

                new_msg["content"] = " ".join(text_parts) if text_parts else "請描述這張圖片"
                if images:
                    new_msg["images"] = images
            else:
                # Already in simple string format
                new_msg["content"] = content

            new_messages.append(new_msg)

        converted_data["messages"] = new_messages

    return converted_data


async def forward_to_ollama_local(request_data: dict, stream: bool = False):
    """Forward request to local Ollama text models via OpenAI-compatible API"""
    url = f"{OLLAMA_LOCAL_BASE_URL}/chat/completions"
    headers = {"Content-Type": "application/json"}

    async with httpx.AsyncClient() as client:
        if stream:
            async with client.stream(
                "POST",
                url,
                headers=headers,
                json={**request_data, "stream": True},
                timeout=300
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    yield chunk
            yield b"data: [DONE]\n\n"
        else:
            response = await client.post(
                url,
                headers=headers,
                json={**request_data, "stream": False},
                timeout=300
            )
            response.raise_for_status()
            yield response.json()


async def forward_to_qwen_vl(request_data: dict, stream: bool = False):
    """Forward request to local LLaVA vision model via Ollama native API"""
    # Convert OpenAI format to Ollama native format
    converted_data = convert_openai_to_ollama_format(request_data)

    # Debug logging
    for msg in converted_data.get("messages", []):
        has_images = "images" in msg and len(msg.get("images", [])) > 0
        logger.info(f"Vision request - role: {msg.get('role')}, has_images: {has_images}, content_length: {len(str(msg.get('content', '')))}")

    # Use Ollama's native API for better vision support
    # Change from /v1/chat/completions to /api/chat
    base_url = QWEN_VL_BASE_URL.replace("/v1", "")
    url = f"{base_url}/api/chat"
    headers = {
        "Content-Type": "application/json"
    }

    # Prepare Ollama native format request
    ollama_request = {
        "model": converted_data.get("model", "qwen2.5vl:7b"),
        "messages": converted_data.get("messages", []),
        "stream": stream
    }

    async with httpx.AsyncClient() as client:
        if stream:
            async with client.stream(
                "POST",
                url,
                headers=headers,
                json=ollama_request,
                timeout=180  # Longer timeout for vision processing
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    # Convert Ollama streaming format to OpenAI format
                    try:
                        chunk_str = chunk.decode('utf-8')
                        for line in chunk_str.strip().split('\n'):
                            if line:
                                data = json.loads(line)
                                if 'message' in data:
                                    openai_chunk = {
                                        "id": "chatcmpl-ollama",
                                        "object": "chat.completion.chunk",
                                        "created": int(datetime.now().timestamp()),
                                        "model": ollama_request["model"],
                                        "choices": [{
                                            "index": 0,
                                            "delta": {"content": data["message"].get("content", "")},
                                            "finish_reason": "stop" if data.get("done") else None
                                        }]
                                    }
                                    yield f"data: {json.dumps(openai_chunk)}\n\n".encode()
                    except:
                        yield chunk
                yield b"data: [DONE]\n\n"
        else:
            response = await client.post(
                url,
                headers=headers,
                json=ollama_request,
                timeout=180
            )
            response.raise_for_status()

            # Convert Ollama response to OpenAI format
            ollama_response = response.json()
            raw_content = ollama_response.get("message", {}).get("content", "")
            cleaned_content, reasoning_content = split_harmony_response(raw_content)
            assistant_msg = {"role": "assistant", "content": cleaned_content}
            if reasoning_content:
                assistant_msg["reasoning_content"] = reasoning_content
            openai_response = {
                "id": "chatcmpl-ollama",
                "object": "chat.completion",
                "created": int(datetime.now().timestamp()),
                "model": ollama_request["model"],
                "choices": [{
                    "index": 0,
                    "message": assistant_msg,
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": ollama_response.get("prompt_eval_count", 0),
                    "completion_tokens": ollama_response.get("eval_count", 0),
                    "total_tokens": ollama_response.get("prompt_eval_count", 0) + ollama_response.get("eval_count", 0)
                }
            }
            yield json.dumps(openai_response).encode()


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest, raw_request: Request, user: Dict = Depends(get_current_user)):
    """Handle chat completion requests"""
    import time
    start_time = time.time()
    record_usage_extra(raw_request, model=request.model)
    if request.stream:
        # Streaming responses log themselves after the generator completes
        record_usage_extra(raw_request, _self_log=True)

    # Convert request to dict
    request_data = request.model_dump(exclude_unset=True)
    # 處理 content 可能是陣列的情況 (視覺模型)
    def get_text_content(content):
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            # 從陣列中提取文字內容，忽略圖片
            texts = [item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text"]
            return " ".join(texts) if texts else "[圖片訊息]"
        return str(content)

    messages_for_record = [{"role": m.role, "content": get_text_content(m.content)} for m in request.messages]

    reject_unknown_chat_model(request.model)

    # === Agent routing: model="auto"/"agent" -> classify -> pick real model ===
    agent_route_label = None
    if request.model in AGENT_VIRTUAL_MODELS:
        target_model, agent_route_label = await route_for_agent(request_data)
        logger.info(f"agent route: {request.model} -> {agent_route_label} -> {target_model}")
        request.model = target_model
        request_data["model"] = target_model

    # Permission check: allowed models (post-routing — check the real target)
    perms = user.get("permissions", {})
    allowed_models = perms.get("allowed_models")
    if allowed_models is not None and request.model not in allowed_models:
        raise HTTPException(status_code=403, detail=f"您沒有使用模型 '{request.model}' 的權限")

    # Permission check: allowed features
    allowed_features = perms.get("allowed_features")
    if allowed_features is not None and "chat" not in allowed_features:
        raise HTTPException(status_code=403, detail="您沒有使用對話功能的權限")

    # Permission check: daily request limit
    daily_limit = perms.get("daily_request_limit", 0)
    if daily_limit > 0 and db_pool:
        try:
            async with db_pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """SELECT COUNT(*) FROM ollama_conversations
                           WHERE username = %s AND DATE(timestamp) = CURDATE()""",
                        (user.get("username"),)
                    )
                    (today_count,) = await cur.fetchone()
                    if today_count >= daily_limit:
                        raise HTTPException(status_code=429, detail=f"已達每日請求上限 ({daily_limit} 次)")
        except HTTPException:
            raise
        except Exception:
            pass  # Don't block on limit check failure

    # Check if this is a DeepSeek model, Qwen-VL model, or local Ollama model
    is_deepseek = request.model in DEEPSEEK_MODELS
    is_qwen_vl = request.model in QWEN_VL_MODELS
    is_ollama_local = request.model in OLLAMA_LOCAL_MODELS

    if is_ollama_local:
        # Handle local Ollama text model request
        try:
            if request.stream:
                async def stream_ollama_local():
                    full_response = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    async for chunk in forward_to_ollama_local(request_data, stream=True):
                        yield chunk
                        try:
                            chunk_str = chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
                            for line in chunk_str.split('\n'):
                                if line.startswith('data: ') and line.strip() != 'data: [DONE]':
                                    data = json.loads(line[6:])
                                    if 'choices' in data and data['choices']:
                                        delta = data['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            full_response += delta['content']
                                    if 'usage' in data:
                                        prompt_tokens = data['usage'].get('prompt_tokens', 0)
                                        completion_tokens = data['usage'].get('completion_tokens', 0)
                        except:
                            pass

                    response_time_ms = (time.time() - start_time) * 1000
                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=full_response,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )
                    await log_chat_usage(raw_request, user, request.model,
                                         prompt_tokens, completion_tokens,
                                         start_time, success=True)

                return StreamingResponse(stream_ollama_local(), media_type="text/event-stream")
            else:
                async for content in forward_to_ollama_local(request_data, stream=False):
                    response_time_ms = (time.time() - start_time) * 1000
                    response_content = ""
                    if isinstance(content, dict) and 'choices' in content:
                        response_content = content['choices'][0]['message']['content']

                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=response_content,
                        prompt_tokens=content.get('usage', {}).get('prompt_tokens', 0),
                        completion_tokens=content.get('usage', {}).get('completion_tokens', 0),
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )
                    return content
        except Exception as e:
            logger.error(f"Ollama local error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    elif is_qwen_vl:
        # Handle Qwen-VL request
        try:
            if request.stream:
                async def stream_qwen_vl():
                    full_response = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    async for chunk in forward_to_qwen_vl(request_data, stream=True):
                        yield chunk
                        try:
                            chunk_str = chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
                            for line in chunk_str.split('\n'):
                                if line.startswith('data: ') and line.strip() != 'data: [DONE]':
                                    data = json.loads(line[6:])
                                    if 'choices' in data and data['choices']:
                                        delta = data['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            full_response += delta['content']
                                    if 'usage' in data:
                                        prompt_tokens = data['usage'].get('prompt_tokens', 0)
                                        completion_tokens = data['usage'].get('completion_tokens', 0)
                        except:
                            pass

                    response_time_ms = (time.time() - start_time) * 1000
                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=full_response,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )
                    await log_chat_usage(raw_request, user, request.model,
                                         prompt_tokens, completion_tokens,
                                         start_time, success=True)

                return StreamingResponse(stream_qwen_vl(), media_type="text/event-stream")
            else:
                async for content in forward_to_qwen_vl(request_data, stream=False):
                    response_time_ms = (time.time() - start_time) * 1000
                    result = json.loads(content)

                    response_content = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    if 'choices' in result and result['choices']:
                        response_content = result['choices'][0].get('message', {}).get('content', '')
                    if 'usage' in result:
                        prompt_tokens = result['usage'].get('prompt_tokens', 0)
                        completion_tokens = result['usage'].get('completion_tokens', 0)

                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=response_content,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )

                    return JSONResponse(content=result)
        except Exception as e:
            import traceback
            logger.error(f"Qwen-VL error: {str(e)}")
            logger.error(f"Qwen-VL traceback: {traceback.format_exc()}")
            response_time_ms = (time.time() - start_time) * 1000
            record_conversation(
                model=request.model,
                messages=messages_for_record,
                response_content=f"Error: {str(e)}",
                response_time_ms=response_time_ms,
                success=False,
                user_id=user.get('id'),
                username=user.get('username')
            )
            raise HTTPException(status_code=500, detail=str(e))

    if is_deepseek:
        # Handle DeepSeek request
        try:
            if request.stream:
                async def stream_deepseek():
                    full_response = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    async for chunk in forward_to_deepseek(request_data, stream=True):
                        yield chunk
                        try:
                            chunk_str = chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
                            for line in chunk_str.split('\n'):
                                if line.startswith('data: ') and line.strip() != 'data: [DONE]':
                                    data = json.loads(line[6:])
                                    if 'choices' in data and data['choices']:
                                        delta = data['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            full_response += delta['content']
                                    if 'usage' in data:
                                        prompt_tokens = data['usage'].get('prompt_tokens', 0)
                                        completion_tokens = data['usage'].get('completion_tokens', 0)
                        except:
                            pass

                    response_time_ms = (time.time() - start_time) * 1000
                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=full_response,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )
                    await log_chat_usage(raw_request, user, request.model,
                                         prompt_tokens, completion_tokens,
                                         start_time, success=True)

                return StreamingResponse(stream_deepseek(), media_type="text/event-stream")
            else:
                async for content in forward_to_deepseek(request_data, stream=False):
                    response_time_ms = (time.time() - start_time) * 1000
                    result = json.loads(content)

                    response_content = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    if 'choices' in result and result['choices']:
                        response_content = result['choices'][0].get('message', {}).get('content', '')
                    if 'usage' in result:
                        prompt_tokens = result['usage'].get('prompt_tokens', 0)
                        completion_tokens = result['usage'].get('completion_tokens', 0)

                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=response_content,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )

                    if agent_route_label:
                        result["agent_route"] = agent_route_label
                    headers = {"x-agent-route": agent_route_label} if agent_route_label else None
                    return JSONResponse(content=result, headers=headers)
        except Exception as e:
            response_time_ms = (time.time() - start_time) * 1000
            record_conversation(
                model=request.model,
                messages=messages_for_record,
                response_content=f"Error: {str(e)}",
                response_time_ms=response_time_ms,
                success=False,
                user_id=user.get('id'),
                username=user.get('username')
            )
            raise HTTPException(status_code=500, detail=str(e))

    # Handle MLX/llama.cpp request - route to the correct endpoint based on model
    endpoint = get_available_endpoint(request.model)

    if not endpoint:
        raise HTTPException(status_code=503, detail="No available Ollama endpoints")

    # Try up to 3 different endpoints if one fails
    for attempt in range(3):
        try:
            if request.stream:
                # For streaming, we wrap the generator to capture the response
                async def stream_with_recording():
                    full_response = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    async for chunk in forward_request(
                        endpoint,
                        "/chat/completions",
                        "POST",
                        dict(raw_request.headers),
                        request_data,
                        stream=True
                    ):
                        yield chunk
                        # Try to extract content from SSE data
                        try:
                            chunk_str = chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
                            for line in chunk_str.split('\n'):
                                if line.startswith('data: ') and line.strip() != 'data: [DONE]':
                                    data = json.loads(line[6:])
                                    if 'choices' in data and data['choices']:
                                        delta = data['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            full_response += delta['content']
                                    if 'usage' in data:
                                        prompt_tokens = data['usage'].get('prompt_tokens', 0)
                                        completion_tokens = data['usage'].get('completion_tokens', 0)
                        except:
                            pass

                    # Record after streaming completes
                    response_time_ms = (time.time() - start_time) * 1000
                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=full_response,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )
                    await log_chat_usage(raw_request, user, request.model,
                                         prompt_tokens, completion_tokens,
                                         start_time, success=True)

                return StreamingResponse(
                    stream_with_recording(),
                    media_type="text/event-stream"
                )
            else:
                # Return regular response
                async for content in forward_request(
                    endpoint,
                    "/chat/completions",
                    "POST",
                    dict(raw_request.headers),
                    request_data,
                    stream=False
                ):
                    response_time_ms = (time.time() - start_time) * 1000
                    result = json.loads(content)

                    # Extract response content and tokens
                    response_content = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    if 'choices' in result and result['choices']:
                        raw_content = result['choices'][0].get('message', {}).get('content', '')
                        response_content, reasoning_content = split_harmony_response(raw_content)
                        result['choices'][0]['message']['content'] = response_content
                        if reasoning_content:
                            result['choices'][0]['message']['reasoning_content'] = reasoning_content
                    if 'usage' in result:
                        prompt_tokens = result['usage'].get('prompt_tokens', 0)
                        completion_tokens = result['usage'].get('completion_tokens', 0)

                    # Record the conversation
                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=response_content,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        response_time_ms=response_time_ms,
                        success=True,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )

                    if agent_route_label:
                        result["agent_route"] = agent_route_label
                    headers = {"x-agent-route": agent_route_label} if agent_route_label else None
                    return JSONResponse(content=result, headers=headers)
        except HTTPException as e:
            if attempt < 2:  # Try another endpoint
                logger.warning(f"Attempt {attempt + 1} failed for {endpoint}, trying another endpoint")
                endpoint = get_available_endpoint(request.model)
                if not endpoint:
                    # Record failed request
                    response_time_ms = (time.time() - start_time) * 1000
                    record_conversation(
                        model=request.model,
                        messages=messages_for_record,
                        response_content=f"Error: {str(e.detail)}",
                        response_time_ms=response_time_ms,
                        success=False,
                        user_id=user.get('id'),
                        username=user.get('username')
                    )
                    raise
            else:
                # Record failed request
                response_time_ms = (time.time() - start_time) * 1000
                record_conversation(
                    model=request.model,
                    messages=messages_for_record,
                    response_content=f"Error: {str(e.detail)}",
                    response_time_ms=response_time_ms,
                    success=False,
                    user_id=user.get('id'),
                    username=user.get('username')
                )
                raise

    raise HTTPException(status_code=503, detail="All retry attempts failed")

@app.post("/v1/completions")
async def completions(request: Request, user: Dict = Depends(get_current_user)):
    """Handle completion requests"""
    request_data = await request.json()
    model = request_data.get("model")

    reject_unknown_chat_model(model)

    # Route to the correct endpoint based on model
    endpoint = get_available_endpoint(model)

    if not endpoint:
        raise HTTPException(status_code=503, detail="No available Ollama endpoints")

    # Forward the request
    async for content in forward_request(
        endpoint,
        "/completions",
        "POST",
        dict(request.headers),
        request_data,
        stream=request_data.get("stream", False)
    ):
        if request_data.get("stream", False):
            return StreamingResponse(
                content,
                media_type="text/event-stream"
            )
        else:
            return JSONResponse(content=json.loads(content))


@app.post("/v1/embeddings")
async def embeddings(request: Request, user: Dict = Depends(get_current_user)):
    """Handle embedding requests - forward to the appropriate endpoint"""
    request_data = await request.json()
    model = request_data.get("model")
    record_usage_extra(request, model=model)

    if not model:
        raise HTTPException(status_code=400, detail="必須指定 model 欄位")
    if model not in MODEL_ENDPOINT_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"未知的模型 '{model}'。可用模型：{sorted(MODEL_ENDPOINT_MAP.keys())}"
        )

    # Route to the correct endpoint based on model
    endpoint = get_available_endpoint(model)

    if not endpoint:
        raise HTTPException(status_code=503, detail="No available embedding endpoints")

    url = f"{endpoint}/embeddings"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    timeout_config = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)

    async with httpx.AsyncClient(timeout=timeout_config) as client:
        try:
            response = await client.post(url, headers=headers, json=request_data)
            response.raise_for_status()
            return JSONResponse(content=response.json())
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:200])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Embedding request failed: {str(e)}")


@app.post("/v1/vision/analyze")
async def vision_analyze(request: Request, user: Dict = Depends(get_current_user)):
    """Forward vision analysis request to Qwen2.5-VL API"""
    url = f"{QWEN_VL_BASE_URL}/vision/analyze"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    request_data = await request.json()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                url,
                headers=headers,
                json=request_data,
                timeout=180
            )
            response.raise_for_status()
            return JSONResponse(content=response.json())
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# ===== Speech-to-Text API Endpoints =====

@app.post("/v1/audio/transcriptions")
async def transcribe_audio(file: UploadFile = File(...), user: Dict = Depends(get_current_user)):
    """語音轉文字 - 上傳音訊檔案"""
    af = user.get("permissions", {}).get("allowed_features")
    if af is not None and "speech" not in af:
        raise HTTPException(status_code=403, detail="您沒有使用語音轉文字功能的權限")
    url = f"{SPEECH_API_BASE_URL}/transcribe"

    # 讀取上傳的檔案
    file_content = await file.read()

    async with httpx.AsyncClient() as client:
        try:
            # 使用 multipart/form-data 發送檔案
            files = {"file": (file.filename, file_content, file.content_type or "audio/wav")}
            response = await client.post(
                url,
                files=files,
                timeout=120  # 語音轉文字可能需要較長時間
            )
            response.raise_for_status()
            return JSONResponse(content=response.json())
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="語音轉文字服務超時，請稍後再試")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"語音轉文字失敗: {str(e)}")


@app.post("/v1/audio/transcriptions/base64")
async def transcribe_audio_base64(request: Request, user: Dict = Depends(get_current_user)):
    """語音轉文字 - Base64 格式"""
    url = f"{SPEECH_API_BASE_URL}/transcribe/base64"

    request_data = await request.json()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                url,
                json=request_data,
                timeout=120
            )
            response.raise_for_status()
            return JSONResponse(content=response.json())
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="語音轉文字服務超時，請稍後再試")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"語音轉文字失敗: {str(e)}")


# 翻譯目標語言對應
TRANSLATE_LANGUAGES = {
    "zh-TW": "繁體中文",
    "zh-CN": "簡體中文",
    "en": "英文",
    "ja": "日文",
    "ko": "韓文",
    "fr": "法文",
    "de": "德文",
    "es": "西班牙文",
    "pt": "葡萄牙文",
    "ru": "俄文",
    "ar": "阿拉伯文",
    "th": "泰文",
    "vi": "越南文",
}


class TranslateRequest(BaseModel):
    text: str
    target_language: str = "en"
    model: Optional[str] = "qwen2.5:72b"


@app.post("/v1/audio/translate")
async def translate_text(request: TranslateRequest, user: Dict = Depends(get_current_user)):
    """文字翻譯 - 使用 LLM 進行翻譯"""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="請提供要翻譯的文字")

    reject_unknown_chat_model(request.model)

    target_lang = TRANSLATE_LANGUAGES.get(request.target_language, request.target_language)

    # 構建翻譯提示
    translate_prompt = f"""請將以下文字翻譯成{target_lang}，只輸出翻譯結果，不要加任何解釋或說明：

{request.text}"""

    # 使用指定的模型進行翻譯
    chat_request = ChatCompletionRequest(
        model=request.model,
        messages=[ChatMessage(role="user", content=translate_prompt)],
        temperature=0.3,
        stream=False
    )

    # 判斷使用哪個模型服務
    is_deepseek = request.model in DEEPSEEK_MODELS

    try:
        if is_deepseek:
            request_data = chat_request.model_dump(exclude_unset=True)
            async for content in forward_to_deepseek(request_data, stream=False):
                result = json.loads(content)
                if 'choices' in result and result['choices']:
                    translated_text = result['choices'][0].get('message', {}).get('content', '').strip()
                    return JSONResponse(content={
                        "success": True,
                        "original_text": request.text,
                        "translated_text": translated_text,
                        "target_language": request.target_language,
                        "target_language_name": target_lang,
                        "model": request.model
                    })
        else:
            # 使用 Ollama 端點 - route to the correct endpoint based on model
            endpoint = get_available_endpoint(request.model)
            if not endpoint:
                raise HTTPException(status_code=503, detail="沒有可用的翻譯服務")

            request_data = chat_request.model_dump(exclude_unset=True)
            async for content in forward_request(
                endpoint,
                "/chat/completions",
                "POST",
                {},
                request_data,
                stream=False
            ):
                result = json.loads(content)
                if 'choices' in result and result['choices']:
                    translated_text = result['choices'][0].get('message', {}).get('content', '').strip()
                    return JSONResponse(content={
                        "success": True,
                        "original_text": request.text,
                        "translated_text": translated_text,
                        "target_language": request.target_language,
                        "target_language_name": target_lang,
                        "model": request.model
                    })

        raise HTTPException(status_code=500, detail="翻譯失敗：無法取得翻譯結果")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"翻譯失敗: {str(e)}")


@app.post("/v1/audio/transcribe-and-translate")
async def transcribe_and_translate(
    file: UploadFile = File(...),
    target_language: str = "en",
    model: str = "qwen2.5:72b",
    user: Dict = Depends(get_current_user)
):
    """語音轉文字並即時翻譯 - 一次完成轉錄與翻譯"""
    reject_unknown_chat_model(model)

    # 步驟1: 語音轉文字
    url = f"{SPEECH_API_BASE_URL}/transcribe"
    file_content = await file.read()

    async with httpx.AsyncClient() as client:
        try:
            files = {"file": (file.filename, file_content, file.content_type or "audio/wav")}
            response = await client.post(url, files=files, timeout=120)
            response.raise_for_status()
            transcription_result = response.json()
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="語音轉文字服務超時")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"語音轉文字失敗: {str(e)}")

    # 取得轉錄文字
    original_text = transcription_result.get("text", "")
    if not original_text:
        return JSONResponse(content={
            "success": True,
            "original_text": "",
            "translated_text": "",
            "target_language": target_language,
            "message": "未偵測到語音內容"
        })

    # 步驟2: 翻譯
    target_lang = TRANSLATE_LANGUAGES.get(target_language, target_language)
    translate_prompt = f"""請將以下文字翻譯成{target_lang}，只輸出翻譯結果，不要加任何解釋或說明：

{original_text}"""

    chat_request = ChatCompletionRequest(
        model=model,
        messages=[ChatMessage(role="user", content=translate_prompt)],
        temperature=0.3,
        stream=False
    )

    is_deepseek = model in DEEPSEEK_MODELS

    try:
        if is_deepseek:
            request_data = chat_request.model_dump(exclude_unset=True)
            async for content in forward_to_deepseek(request_data, stream=False):
                result = json.loads(content)
                if 'choices' in result and result['choices']:
                    translated_text = result['choices'][0].get('message', {}).get('content', '').strip()
                    return JSONResponse(content={
                        "success": True,
                        "original_text": original_text,
                        "translated_text": translated_text,
                        "target_language": target_language,
                        "target_language_name": target_lang,
                        "model": model
                    })
        else:
            # Route to the correct endpoint based on model
            endpoint = get_available_endpoint(model)
            if not endpoint:
                raise HTTPException(status_code=503, detail="沒有可用的翻譯服務")

            request_data = chat_request.model_dump(exclude_unset=True)
            async for content in forward_request(
                endpoint,
                "/chat/completions",
                "POST",
                {},
                request_data,
                stream=False
            ):
                result = json.loads(content)
                if 'choices' in result and result['choices']:
                    translated_text = result['choices'][0].get('message', {}).get('content', '').strip()
                    return JSONResponse(content={
                        "success": True,
                        "original_text": original_text,
                        "translated_text": translated_text,
                        "target_language": target_language,
                        "target_language_name": target_lang,
                        "model": model
                    })

        # 翻譯失敗但轉錄成功
        return JSONResponse(content={
            "success": True,
            "original_text": original_text,
            "translated_text": "",
            "target_language": target_language,
            "message": "轉錄成功但翻譯失敗"
        })

    except Exception as e:
        # 翻譯失敗但轉錄成功
        return JSONResponse(content={
            "success": True,
            "original_text": original_text,
            "translated_text": "",
            "target_language": target_language,
            "error": str(e),
            "message": "轉錄成功但翻譯失敗"
        })


# ==================== OCR API Endpoints ====================

@app.get("/v1/ocr/models")
async def list_ocr_models(user: Dict = Depends(get_current_user)):
    """List available OCR models"""
    models = []
    for model_id, info in OCR_MODELS.items():
        models.append({
            "id": model_id,
            "name": info["name"],
            "type": info["type"],
            "description": info["description"],
            "features": info["features"],
            "best_for": info["best_for"],
            "available": True if info["type"] == "local" else (deepseek_ocr_health if info["type"] == "deepseek" else ocr_api_health)
        })
    return {"models": models}


@app.get("/v1/ocr/health")
async def ocr_health_check(user: Dict = Depends(get_current_user)):
    """Check OCR service health"""
    global ocr_api_health, deepseek_ocr_health

    # Check local LLaVA model
    llava_healthy = qwen_vl_health

    # Check external OCR API (PP-OCR)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OCR_API_BASE_URL}/health", timeout=5)
            ocr_api_health = response.status_code == 200
    except Exception:
        ocr_api_health = False

    # Check DeepSeek OCR API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{DEEPSEEK_OCR_BASE_URL}/health", timeout=5)
            deepseek_ocr_health = response.status_code == 200
    except Exception:
        deepseek_ocr_health = False

    return {
        "status": "healthy" if (llava_healthy or ocr_api_health or deepseek_ocr_health) else "unhealthy",
        "services": {
            "llava_local": "healthy" if llava_healthy else "unhealthy",
            "external_ocr": "healthy" if ocr_api_health else "unhealthy",
            "deepseek_ocr": "healthy" if deepseek_ocr_health else "unhealthy"
        }
    }


# ==================== Async OCR Jobs (robust for long OCR) ====================
# In-memory job store. Jobs are lost on restart — that's acceptable; users can resubmit.
_ocr_jobs: Dict[str, Dict[str, Any]] = {}

# Per-backend concurrency limits. Protects single-GPU upstreams from overload.
# Each call to _ocr_one_page acquires the relevant semaphore around the HTTP request.
_OCR_CONCURRENCY = {
    "deepseek": 1,          # 192.168.0.191:8001 — single GPU
    "local": 1,             # 192.168.0.191:8002 Qwen-VL — single GPU
    "external": 2,          # pp-ocr-service (Mac CPU) — moderate
    "paddleocr_remote": 1,  # 192.168.0.191:8866 PaddleOCR Serving — single GPU shared
}
_ocr_semaphores: Dict[str, asyncio.Semaphore] = {}


def _get_ocr_semaphore(backend_type: str) -> asyncio.Semaphore:
    if backend_type not in _ocr_semaphores:
        _ocr_semaphores[backend_type] = asyncio.Semaphore(_OCR_CONCURRENCY.get(backend_type, 1))
    return _ocr_semaphores[backend_type]


def _ocr_backend_stats() -> Dict[str, Dict[str, int]]:
    """Return {backend: {limit, in_use, waiting}} for observability."""
    stats = {}
    for bt, limit in _OCR_CONCURRENCY.items():
        sem = _ocr_semaphores.get(bt)
        if sem is None:
            stats[bt] = {"limit": limit, "in_use": 0, "waiting": 0}
        else:
            in_use = limit - sem._value  # private but stable in CPython
            waiting = len(sem._waiters) if sem._waiters else 0
            stats[bt] = {"limit": limit, "in_use": in_use, "waiting": waiting}
    return stats


def _build_ocr_prompt(language: str) -> str:
    if language == "auto":
        return "請辨識圖片中的所有文字，保持原始排版，只輸出文字。"
    if language == "en":
        return "Recognize all English text in this image, keep layout, output text only."
    if language == "zh":
        return "請辨識圖片中的所有中文文字，保持原始排版。"
    return f"Recognize all text (language: {language}), keep layout."


async def _ocr_one_page(
    client: "httpx.AsyncClient",
    model: str,
    model_info: dict,
    img_bytes: bytes,
    content_type: str,
    is_pdf: bool,
    page_no: int,
    has_label: bool,
    filename: str,
    language: str,
    ocr_prompt: str,
) -> tuple:
    """Return (text, confidence). Never raises — encodes errors into text.

    Acquires the per-backend semaphore so we never overload a single-GPU upstream.
    """
    import base64 as _b64
    sem = _get_ocr_semaphore(model_info["type"])
    await sem.acquire()
    try:
        if model_info["type"] == "local":
            b64 = _b64.b64encode(img_bytes).decode("utf-8")
            r = await client.post(
                f"{QWEN_VL_OCR_URL}/ocr/base64",
                json={"image_base64": b64, "prompt": ocr_prompt},
            )
            if r.status_code == 200:
                return (r.json().get("text") or "").strip(), 0.85
            return f"[辨識失敗 {r.status_code}]", 0.0
        if model_info["type"] == "deepseek":
            files_arg = {
                "file": (
                    f"page_{page_no}.png" if has_label else (filename or "image.png"),
                    img_bytes,
                    "image/png" if is_pdf else content_type,
                )
            }
            r = await client.post(
                f"{DEEPSEEK_OCR_BASE_URL}/ocr/file",
                files=files_arg,
                data={"prompt": ocr_prompt},
            )
            if r.status_code == 200:
                res = r.json()
                if res.get("success", False):
                    return _strip_deepseek_noise(res.get("text", "")), 0.95
                return "[辨識失敗]", 0.0
            return f"[辨識失敗 {r.status_code}]", 0.0
        if model_info["type"] == "paddleocr_remote":
            files_arg = {
                "file": (
                    f"page_{page_no}.png" if has_label else (filename or "image.png"),
                    img_bytes,
                    "image/png" if is_pdf else content_type,
                )
            }
            r = await client.post(
                f"{PADDLEOCR_REMOTE_URL}/ocr",
                files=files_arg,
            )
            if r.status_code == 200:
                res = r.json()
                if res.get("success", True):
                    details = res.get("details") or res.get("results") or []
                    lines = [d.get("text", "") for d in details if d.get("text")]
                    confs = [d.get("confidence") for d in details if d.get("confidence") is not None]
                    avg_conf = sum(confs) / len(confs) if confs else 0.9
                    return "\n".join(lines), avg_conf
                return f"[辨識失敗: {res.get('error','unknown')}]", 0.0
            return f"[辨識失敗 {r.status_code}]", 0.0
        # external (PP-OCR)
        files_arg = {
            "file": (
                f"page_{page_no}.png" if has_label else (filename or "image.png"),
                img_bytes,
                "image/png" if is_pdf else content_type,
            )
        }
        r = await client.post(
            f"{OCR_API_BASE_URL}/ocr/recognize",
            files=files_arg,
            data={"model": model, "language": language},
        )
        if r.status_code == 200:
            res = r.json()
            return (res.get("text") or "").strip(), res.get("confidence", 0.9)
        return f"[辨識失敗 {r.status_code}]", 0.0
    except httpx.TimeoutException:
        return "[辨識失敗: 單頁超時]", 0.0
    except Exception as exc:
        return f"[辨識錯誤: {str(exc)[:200]}]", 0.0
    finally:
        sem.release()


async def _run_ocr_job(
    job_id: str,
    file_content: bytes,
    content_type: str,
    is_pdf: bool,
    model: str,
    language: str,
    filename: str,
):
    job = _ocr_jobs[job_id]
    model_info = OCR_MODELS[model]
    ocr_prompt = _build_ocr_prompt(language)
    import time as _time, gc as _gc
    pdf_doc = None
    try:
        # Count pages (lazy render — don't materialize all images)
        job["status"] = "rendering"
        if is_pdf:
            pdf_doc = fitz.open(stream=file_content, filetype="pdf")
            total = len(pdf_doc)
            dpi = 300 if model == "deepseek-ocr" else 200
            mat = fitz.Matrix(dpi / 72, dpi / 72)
        else:
            total = 1

        job["total_pages"] = total
        job["status"] = "processing"

        async with httpx.AsyncClient(timeout=600) as client:
            for idx in range(total):
                page_no = idx + 1
                job["current_page"] = page_no

                # Render this page ON DEMAND (single page image in RAM at a time)
                if is_pdf:
                    pix = pdf_doc[idx].get_pixmap(matrix=mat)
                    img_bytes = pix.tobytes("png")
                    pix = None  # free pixmap immediately
                    label = f"第 {page_no} 頁"
                    has_label = True
                else:
                    img_bytes = file_content
                    label = None
                    has_label = False

                text, conf = await _ocr_one_page(
                    client, model, model_info, img_bytes, content_type,
                    is_pdf, page_no, has_label, filename, language, ocr_prompt,
                )

                # Release per-page image buffer immediately; helps for 300 DPI A4 (~5MB/page)
                img_bytes = None
                if is_pdf:
                    _gc.collect()

                job["pages"].append({
                    "page": page_no,
                    "label": label,
                    "text": text,
                    "confidence": conf,
                })
                job["completed_pages"] = page_no

        # Close PDF and drop raw bytes reference — free source memory before building full_text
        if pdf_doc is not None:
            pdf_doc.close()
            pdf_doc = None
        file_content = None
        _gc.collect()

        # Build full text
        parts = []
        confidences = []
        for p in job["pages"]:
            if p["label"]:
                parts.append(f"--- {p['label']} ---\n{p['text']}")
            else:
                parts.append(p["text"])
            if p["confidence"] > 0:
                confidences.append(p["confidence"])
        job["full_text"] = "\n\n".join(parts)
        job["total_chars"] = len(job["full_text"])
        job["confidence"] = round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        job["processing_time_ms"] = round((_time.time() - job["started_at"]) * 1000, 1)
        job["status"] = "done"
        job["finished_at"] = _time.time()
    except Exception as exc:
        logger.exception(f"OCR job {job_id} failed")
        job["status"] = "error"
        job["error"] = str(exc)
        job["finished_at"] = _time.time()
    finally:
        if pdf_doc is not None:
            try: pdf_doc.close()
            except Exception: pass
        _gc.collect()


@app.post("/v1/ocr/submit")
async def ocr_submit(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form("paddleocr-remote"),
    language: str = Form("auto"),
    user: Dict = Depends(get_current_user),
):
    """Submit an async OCR job. Returns {job_id}; poll /v1/ocr/jobs/{job_id} for progress."""
    import time as _time, uuid as _uuid

    record_usage_extra(request, model=model)
    af = user.get("permissions", {}).get("allowed_features")
    if af is not None and "ocr" not in af:
        raise HTTPException(status_code=403, detail="您沒有使用 OCR 辨識功能的權限")
    if model not in OCR_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown OCR model: {model}")

    file_content = await file.read()
    file_size = len(file_content)
    content_type = file.content_type or ""
    filename_lower = (file.filename or "").lower()
    if not content_type or content_type == "application/octet-stream":
        if filename_lower.endswith(".pdf"):
            content_type = "application/pdf"
        elif filename_lower.endswith(".png"):
            content_type = "image/png"
        elif filename_lower.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif filename_lower.endswith(".gif"):
            content_type = "image/gif"
        elif filename_lower.endswith(".webp"):
            content_type = "image/webp"
        elif filename_lower.endswith(".bmp"):
            content_type = "image/bmp"
    is_image = content_type.startswith("image/")
    is_pdf = content_type == "application/pdf" or filename_lower.endswith(".pdf")
    if not is_image and not is_pdf:
        raise HTTPException(status_code=400, detail="Only image or PDF supported")
    if file_size > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 20MB limit")

    # Persist upload
    try:
        _upload_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "ocr")
        _date_dir = os.path.join(_upload_root, datetime.now().strftime("%Y-%m-%d"))
        os.makedirs(_date_dir, exist_ok=True)
        _ts = datetime.now().strftime("%H%M%S_%f")
        _safe_user = "".join(c for c in (user.get("username") or "anon") if c.isalnum() or c in "-_")[:32]
        _safe_name = "".join(c for c in (file.filename or "upload") if c.isalnum() or c in ".-_") or "upload"
        _save_path = os.path.join(_date_dir, f"{_ts}_{_safe_user}_{_safe_name}")
        with open(_save_path, "wb") as _fp:
            _fp.write(file_content)
    except Exception as _e:
        logger.warning(f"Failed to persist OCR upload: {_e}")

    job_id = _uuid.uuid4().hex
    _ocr_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "model": model,
        "model_name": OCR_MODELS[model].get("name", model),
        "total_pages": 0,
        "completed_pages": 0,
        "current_page": 0,
        "pages": [],
        "full_text": "",
        "total_chars": 0,
        "confidence": 0.0,
        "error": None,
        "started_at": _time.time(),
        "finished_at": None,
        "username": user.get("username"),
        "filename": file.filename,
    }
    asyncio.create_task(_run_ocr_job(job_id, file_content, content_type, is_pdf, model, language, file.filename or "upload"))

    # Opportunistic cleanup of old finished jobs (keep last ~50)
    if len(_ocr_jobs) > 80:
        done_ids = sorted(
            [jid for jid, j in _ocr_jobs.items() if j.get("finished_at")],
            key=lambda jid: _ocr_jobs[jid].get("finished_at") or 0,
        )
        for jid in done_ids[:30]:
            _ocr_jobs.pop(jid, None)

    return {"job_id": job_id}


@app.get("/v1/ocr/jobs/{job_id}")
async def ocr_get_job(job_id: str, user: Dict = Depends(get_current_user)):
    job = _ocr_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return {**job, "backend_stats": _ocr_backend_stats()}


_REMITTANCE_PROMPT = """你是專業的銀行匯款通知書文件整理助手。

以下是 OCR 辨識出的銀行匯入/匯出匯款通知書原文（可能有多頁、辨識誤差）。請：

1. 判斷頁數，逐頁整理
2. 提取每頁關鍵欄位：匯款編號 / 通知日期 / 生效日 / 匯款人（名稱、地址、帳號）/ 收款人（名稱、地址、帳號、分行）/ 匯款金額（幣別+金額+大寫）/ 原匯款金額 / 匯款銀行 / 存匯行 / 費用（誰支付、金額）/ 匯款附言 / 備註
3. 自動修正明顯的 OCR 錯誤（例如空格錯位、字形相似錯字）但不要臆造內容
4. 以 Markdown 表格或條列呈現，每頁一段，清晰易讀
5. 若有多筆匯款，摘要在最後列「總覽」表格（頁次/匯款編號/金額/匯款人/收款人）

只輸出整理後的 Markdown，不要加入解釋、前言或後記。"""


async def _format_job_with_deepseek(job_id: str):
    job = _ocr_jobs.get(job_id)
    if not job:
        return
    import json as _json
    job["ai_format_status"] = "running"
    job["formatted_markdown"] = ""
    job["ai_format_usage"] = None
    job["ai_format_error"] = None
    try:
        if not DEEPSEEK_API_KEY:
            job["ai_format_status"] = "error"
            job["ai_format_error"] = "DEEPSEEK_API_KEY is not configured"
            return
        text = job.get("full_text") or ""
        if not text.strip():
            job["ai_format_status"] = "error"
            job["ai_format_error"] = "OCR 內容為空，無法整理"
            return

        buf = []
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": _REMITTANCE_PROMPT},
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.2,
                    "stream": True,
                },
            ) as r:
                if r.status_code != 200:
                    body = await r.aread()
                    job["ai_format_status"] = "error"
                    job["ai_format_error"] = f"DeepSeek API {r.status_code}: {body.decode('utf-8', errors='replace')[:400]}"
                    return
                async for raw_line in r.aiter_lines():
                    if not raw_line:
                        continue
                    if not raw_line.startswith("data: "):
                        continue
                    payload = raw_line[6:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        obj = _json.loads(payload)
                    except Exception:
                        continue
                    choices = obj.get("choices") or []
                    if choices:
                        delta = choices[0].get("delta") or {}
                        piece = delta.get("content") or ""
                        if piece:
                            buf.append(piece)
                            # Update job incrementally so frontend polling can render partial markdown
                            job["formatted_markdown"] = "".join(buf)
                    usage = obj.get("usage")
                    if usage:
                        job["ai_format_usage"] = usage
        job["formatted_markdown"] = "".join(buf).strip()
        job["ai_format_status"] = "done"
    except Exception as exc:
        logger.exception(f"AI format failed for job {job_id}")
        job["ai_format_status"] = "error"
        job["ai_format_error"] = str(exc)[:300]


@app.post("/v1/ocr/jobs/{job_id}/format")
async def ocr_format_job(job_id: str, user: Dict = Depends(get_current_user)):
    """Trigger DeepSeek AI post-processing to extract structured Markdown from OCR text."""
    job = _ocr_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Job must be completed (current: {job['status']})")
    if job.get("ai_format_status") == "running":
        return {"job_id": job_id, "ai_format_status": "running"}
    job["ai_format_status"] = "queued"
    asyncio.create_task(_format_job_with_deepseek(job_id))
    return {"job_id": job_id, "ai_format_status": "queued"}


@app.get("/v1/ocr/queue")
async def ocr_queue_status(user: Dict = Depends(get_current_user)):
    """Return concurrency limits + active/waiting counts per backend, and all active jobs."""
    active = [
        {
            "job_id": j["job_id"],
            "model": j["model"],
            "status": j["status"],
            "completed_pages": j["completed_pages"],
            "total_pages": j["total_pages"],
            "filename": j.get("filename"),
            "username": j.get("username"),
        }
        for j in _ocr_jobs.values()
        if j["status"] in ("queued", "rendering", "processing")
    ]
    return {
        "backends": _ocr_backend_stats(),
        "active_jobs": active,
        "total_jobs_in_store": len(_ocr_jobs),
    }


@app.post("/v1/ocr/recognize_stream")
async def ocr_recognize_stream(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form("paddleocr-remote"),
    language: str = Form("auto"),
    user: Dict = Depends(get_current_user),
):
    """Stream OCR results page-by-page as NDJSON (application/x-ndjson).

    Events (one JSON per line):
      {event:"start", total_pages, model, model_name}
      {event:"rendering", total_pages}
      {event:"processing", page, total, label}
      {event:"page", page, total, label, text, confidence}
      {event:"done", processing_time_ms, total_chars, confidence}
      {event:"error", message}
    """
    import base64 as _b64, time as _time, json as _json

    record_usage_extra(request, model=model)
    af = user.get("permissions", {}).get("allowed_features")
    if af is not None and "ocr" not in af:
        raise HTTPException(status_code=403, detail="您沒有使用 OCR 辨識功能的權限")
    if model not in OCR_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown OCR model: {model}")
    model_info = OCR_MODELS[model]

    file_content = await file.read()
    file_size = len(file_content)
    content_type = file.content_type or ""
    filename_lower = (file.filename or "").lower()
    if not content_type or content_type == "application/octet-stream":
        if filename_lower.endswith(".pdf"):
            content_type = "application/pdf"
        elif filename_lower.endswith(".png"):
            content_type = "image/png"
        elif filename_lower.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif filename_lower.endswith(".gif"):
            content_type = "image/gif"
        elif filename_lower.endswith(".webp"):
            content_type = "image/webp"
        elif filename_lower.endswith(".bmp"):
            content_type = "image/bmp"
    is_image = content_type.startswith("image/")
    is_pdf = content_type == "application/pdf" or filename_lower.endswith(".pdf")
    if not is_image and not is_pdf:
        raise HTTPException(status_code=400, detail="Only image or PDF supported")
    if file_size > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 20MB limit")

    # Persist upload
    try:
        _upload_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "ocr")
        _date_dir = os.path.join(_upload_root, datetime.now().strftime("%Y-%m-%d"))
        os.makedirs(_date_dir, exist_ok=True)
        _ts = datetime.now().strftime("%H%M%S_%f")
        _safe_user = "".join(c for c in (user.get("username") or "anon") if c.isalnum() or c in "-_")[:32]
        _safe_name = "".join(c for c in (file.filename or "upload") if c.isalnum() or c in ".-_") or "upload"
        _save_path = os.path.join(_date_dir, f"{_ts}_{_safe_user}_{_safe_name}")
        with open(_save_path, "wb") as _fp:
            _fp.write(file_content)
        logger.info(f"Saved OCR upload (stream): {_save_path} ({file_size} bytes, model={model})")
    except Exception as _e:
        logger.warning(f"Failed to persist OCR upload: {_e}")

    # Build OCR prompt
    if language == "auto":
        ocr_prompt = "請辨識圖片中的所有文字，保持原始排版，只輸出文字。"
    elif language == "en":
        ocr_prompt = "Recognize all English text in this image, keep layout, output text only."
    elif language == "zh":
        ocr_prompt = "請辨識圖片中的所有中文文字，保持原始排版。"
    else:
        ocr_prompt = f"Recognize all text (language: {language}), keep layout."

    async def generate():
        def emit(obj):
            return (_json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")

        start_ts = _time.time()
        all_parts = []
        confidences = []

        try:
            # Render pages
            pages = []  # [(label, png_bytes)]
            if is_pdf:
                yield emit({"event": "rendering", "message": "正在將 PDF 轉換為圖片…"})
                pdf_doc = fitz.open(stream=file_content, filetype="pdf")
                dpi = 300 if model == "deepseek-ocr" else 200
                mat = fitz.Matrix(dpi / 72, dpi / 72)
                for i in range(len(pdf_doc)):
                    pix = pdf_doc[i].get_pixmap(matrix=mat)
                    pages.append((f"第 {i + 1} 頁", pix.tobytes("png")))
                pdf_doc.close()
            else:
                pages.append((None, file_content))

            yield emit({
                "event": "start",
                "total_pages": len(pages),
                "model": model,
                "model_name": model_info.get("name", model),
            })

            async with httpx.AsyncClient(timeout=600) as client:
                for idx, (label, img_bytes) in enumerate(pages):
                    page_no = idx + 1
                    yield emit({
                        "event": "processing",
                        "page": page_no,
                        "total": len(pages),
                        "label": label or "圖片",
                    })
                    text = ""
                    conf = 0.0
                    try:
                        if model_info["type"] == "local":
                            b64 = _b64.b64encode(img_bytes).decode("utf-8")
                            r = await client.post(
                                f"{QWEN_VL_OCR_URL}/ocr/base64",
                                json={"image_base64": b64, "prompt": ocr_prompt},
                            )
                            if r.status_code == 200:
                                text = (r.json().get("text") or "").strip()
                                conf = 0.85
                            else:
                                text = f"[辨識失敗 {r.status_code}]"
                        elif model_info["type"] == "deepseek":
                            files_arg = {
                                "file": (
                                    f"page_{page_no}.png" if label else (file.filename or "image.png"),
                                    img_bytes,
                                    "image/png" if is_pdf else content_type,
                                )
                            }
                            r = await client.post(
                                f"{DEEPSEEK_OCR_BASE_URL}/ocr/file",
                                files=files_arg,
                                data={"prompt": ocr_prompt},
                            )
                            if r.status_code == 200:
                                res = r.json()
                                if res.get("success", False):
                                    text = _strip_deepseek_noise(res.get("text", ""))
                                    conf = 0.95
                                else:
                                    text = "[辨識失敗]"
                            else:
                                text = f"[辨識失敗 {r.status_code}]"
                        else:
                            files_arg = {
                                "file": (
                                    f"page_{page_no}.png" if label else (file.filename or "image.png"),
                                    img_bytes,
                                    "image/png" if is_pdf else content_type,
                                )
                            }
                            r = await client.post(
                                f"{OCR_API_BASE_URL}/ocr/recognize",
                                files=files_arg,
                                data={"model": model, "language": language},
                            )
                            if r.status_code == 200:
                                res = r.json()
                                text = (res.get("text") or "").strip()
                                conf = res.get("confidence", 0.9)
                            else:
                                text = f"[辨識失敗 {r.status_code}]"
                    except httpx.TimeoutException:
                        text = "[辨識失敗: 單頁超時]"
                    except Exception as exc:
                        text = f"[辨識錯誤: {str(exc)[:200]}]"

                    part = f"--- {label} ---\n{text}" if label else text
                    all_parts.append(part)
                    if conf > 0:
                        confidences.append(conf)
                    yield emit({
                        "event": "page",
                        "page": page_no,
                        "total": len(pages),
                        "label": label,
                        "text": text,
                        "confidence": conf,
                    })

            elapsed_ms = (_time.time() - start_ts) * 1000
            full_text = "\n\n".join(all_parts)
            yield emit({
                "event": "done",
                "processing_time_ms": round(elapsed_ms, 1),
                "total_chars": len(full_text),
                "confidence": round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
                "full_text": full_text,
            })
        except Exception as exc:
            logger.exception("Stream OCR error")
            yield emit({"event": "error", "message": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # Disable proxy buffering (nginx/CF)
            "Connection": "keep-alive",
        },
    )


@app.post("/v1/ocr/recognize")
async def ocr_recognize(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form("paddleocr-remote"),
    output_format: str = Form("text"),
    language: str = Form("auto"),
    user: Dict = Depends(get_current_user)
):
    """
    Perform OCR on uploaded image

    - model: OCR model to use (llava-ocr, general-ocr, table-ocr, invoice-ocr)
    - output_format: Output format (text, json, markdown, all)
    - language: Target language for OCR (auto, zh, en, ja, etc.)
    """
    record_usage_extra(request, model=model)
    af = user.get("permissions", {}).get("allowed_features")
    if af is not None and "ocr" not in af:
        raise HTTPException(status_code=403, detail="您沒有使用 OCR 辨識功能的權限")

    import time
    import base64

    start_time = time.time()

    # Validate model
    if model not in OCR_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown OCR model: {model}. Available: {list(OCR_MODELS.keys())}")

    model_info = OCR_MODELS[model]

    # Read file content
    file_content = await file.read()
    file_size = len(file_content)

    # Validate file type and infer content_type if missing
    content_type = file.content_type or ""
    filename_lower = (file.filename or "").lower()

    # Infer content_type from filename if not provided
    if not content_type or content_type == "application/octet-stream":
        if filename_lower.endswith(".png"):
            content_type = "image/png"
        elif filename_lower.endswith(".jpg") or filename_lower.endswith(".jpeg"):
            content_type = "image/jpeg"
        elif filename_lower.endswith(".gif"):
            content_type = "image/gif"
        elif filename_lower.endswith(".webp"):
            content_type = "image/webp"
        elif filename_lower.endswith(".bmp"):
            content_type = "image/bmp"
        elif filename_lower.endswith(".pdf"):
            content_type = "application/pdf"

    is_image = content_type.startswith("image/")
    is_pdf = content_type == "application/pdf" or filename_lower.endswith(".pdf")

    if not is_image and not is_pdf:
        raise HTTPException(status_code=400, detail="Only image files (JPG, PNG, GIF, WebP, BMP) or PDF files are supported.")

    # Persist uploaded file to disk for recordkeeping
    try:
        _upload_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "ocr")
        _date_dir = os.path.join(_upload_root, datetime.now().strftime("%Y-%m-%d"))
        os.makedirs(_date_dir, exist_ok=True)
        _ts = datetime.now().strftime("%H%M%S_%f")
        _safe_user = "".join(c for c in (user.get("username") or "anon") if c.isalnum() or c in "-_")[:32]
        _safe_name = "".join(c for c in (file.filename or "upload") if c.isalnum() or c in ".-_") or "upload"
        _save_path = os.path.join(_date_dir, f"{_ts}_{_safe_user}_{_safe_name}")
        with open(_save_path, "wb") as _fp:
            _fp.write(file_content)
        logger.info(f"Saved OCR upload: {_save_path} ({file_size} bytes, model={model})")
    except Exception as _e:
        logger.warning(f"Failed to persist OCR upload: {_e}")

    # Size limit (20MB)
    if file_size > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 20MB limit")

    ocr_text = ""
    confidence = 0.0

    if model_info["type"] == "local":
        # Use LLaVA for OCR
        try:
            # Convert to base64
            base64_image = base64.b64encode(file_content).decode('utf-8')
            image_data_url = f"data:{content_type};base64,{base64_image}"

            # Prepare OCR prompt based on language
            if language == "auto":
                ocr_prompt = """請仔細閱讀這張圖片中的所有文字內容，並完整輸出辨識結果。
要求：
1. 保持原始的排版格式和段落結構
2. 如果是表格，請使用 | 符號分隔欄位，每行一列
3. 如果有標題或段落，請保留層次結構
4. 準確辨識所有文字，包括標點符號和數字
5. 只輸出辨識到的文字內容，不要添加任何解釋或評論"""
            elif language == "zh":
                ocr_prompt = "請辨識圖片中的所有中文文字，保持原始排版格式，只輸出文字內容。"
            elif language == "en":
                ocr_prompt = "Please recognize all English text in this image, maintain the original layout, and output only the text content."
            else:
                ocr_prompt = f"Please recognize all text in this image (language: {language}), maintain the original layout, and output only the text content."

            # Build list of (page_label, image_bytes) to OCR
            pages: list = []
            if is_pdf:
                pdf_doc = fitz.open(stream=file_content, filetype="pdf")
                mat = fitz.Matrix(200 / 72, 200 / 72)
                for i in range(len(pdf_doc)):
                    pix = pdf_doc[i].get_pixmap(matrix=mat)
                    pages.append((f"第 {i + 1} 頁", pix.tobytes("png")))
                pdf_doc.close()
            else:
                pages.append((None, file_content))

            if pages:
                sem = asyncio.Semaphore(1)  # Remote GPU: serial only
                async with httpx.AsyncClient(timeout=600) as client:
                    async def ocr_page(label, img_bytes):
                        async with sem:
                            b64 = base64.b64encode(img_bytes).decode('utf-8')
                            try:
                                response = await client.post(
                                    f"{QWEN_VL_OCR_URL}/ocr/base64",
                                    json={"image_base64": b64, "prompt": ocr_prompt},
                                )
                                if response.status_code == 200:
                                    t = (response.json().get("text") or "").strip()
                                    return f"--- {label} ---\n{t}" if label else t
                                msg = f"[辨識失敗 {response.status_code}]"
                                return f"--- {label} ---\n{msg}" if label else msg
                            except httpx.TimeoutException:
                                msg = "[辨識失敗: 單頁超時]"
                                return f"--- {label} ---\n{msg}" if label else msg
                    parts = await asyncio.gather(*(ocr_page(l, b) for l, b in pages))
                    ocr_text = "\n\n".join(parts)
                    confidence = 0.85
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="OCR request timed out")
        except Exception as e:
            logger.error(f"LLaVA OCR error: {e}")
            raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    elif model_info["type"] == "deepseek":
        # Use DeepSeek OCR API
        if not deepseek_ocr_health:
            raise HTTPException(status_code=503, detail="DeepSeek OCR service is unavailable")

        try:
            # Prepare prompt based on language
            if language == "auto":
                ocr_prompt = "<image>\nFree OCR."
            elif language == "zh":
                ocr_prompt = "<image>\n請辨識圖片中的所有中文文字，保持原始排版格式。"
            elif language == "en":
                ocr_prompt = "<image>\nRecognize all English text in this image, maintain the original layout."
            else:
                ocr_prompt = f"<image>\nRecognize all text in this image (language: {language}), maintain the original layout."

            # Convert RGBA to RGB if necessary (for all image types)
            if is_image:
                from PIL import Image as PILImage
                try:
                    pil_img = PILImage.open(io.BytesIO(file_content))
                    if pil_img.mode in ('RGBA', 'LA', 'P'):
                        # Convert to RGB with white background
                        if pil_img.mode == 'P':
                            pil_img = pil_img.convert('RGBA')
                        rgb_img = PILImage.new('RGB', pil_img.size, (255, 255, 255))
                        if pil_img.mode == 'RGBA':
                            rgb_img.paste(pil_img, mask=pil_img.split()[3])
                        elif pil_img.mode == 'LA':
                            rgb_img.paste(pil_img.convert('RGBA'), mask=pil_img.split()[1])
                        else:
                            rgb_img.paste(pil_img)
                        img_buffer = io.BytesIO()
                        rgb_img.save(img_buffer, format='PNG')
                        file_content = img_buffer.getvalue()
                        content_type = "image/png"
                        logger.info(f"Converted {pil_img.mode} image to RGB PNG")
                except Exception as e:
                    logger.warning(f"Failed to check/convert image format: {e}")

            # Render all PDF pages to images and OCR them (concurrent)
            if is_pdf:
                pdf_doc = fitz.open(stream=file_content, filetype="pdf")
                logger.info(f"Rendering PDF ({len(pdf_doc)} pages) for DeepSeek OCR")
                mat = fitz.Matrix(300 / 72, 300 / 72)
                page_imgs = []
                for page_num in range(len(pdf_doc)):
                    pix = pdf_doc[page_num].get_pixmap(matrix=mat)
                    page_imgs.append((page_num + 1, pix.tobytes("png")))
                pdf_doc.close()

                sem = asyncio.Semaphore(2)  # DeepSeek GPU: low concurrency
                async with httpx.AsyncClient(timeout=600) as client:
                    async def ocr_ds(page_no, img_data):
                        async with sem:
                            files = {"file": (f"page_{page_no}.png", img_data, "image/png")}
                            data = {"prompt": ocr_prompt}
                            try:
                                response = await client.post(
                                    f"{DEEPSEEK_OCR_BASE_URL}/ocr/file",
                                    files=files,
                                    data=data,
                                )
                                if response.status_code == 200:
                                    result = response.json()
                                    if result.get("success", False):
                                        page_text = _strip_deepseek_noise(result.get("text", ""))
                                        if page_text:
                                            return f"--- 第 {page_no} 頁 ---\n{page_text}"
                                    return f"--- 第 {page_no} 頁 ---\n[辨識失敗]"
                                return f"--- 第 {page_no} 頁 ---\n[辨識失敗: {response.status_code}]"
                            except httpx.TimeoutException:
                                return f"--- 第 {page_no} 頁 ---\n[辨識失敗: 單頁超時]"
                    all_texts = await asyncio.gather(*(ocr_ds(n, d) for n, d in page_imgs))
                ocr_text = "\n\n".join(t for t in all_texts if t)
                confidence = 0.95
            else:
                # Regular image processing
                async with httpx.AsyncClient(timeout=180) as client:
                    files = {"file": (file.filename or "image.png", file_content, content_type)}
                    data = {"prompt": ocr_prompt}

                    response = await client.post(
                        f"{DEEPSEEK_OCR_BASE_URL}/ocr/file",
                        files=files,
                        data=data
                    )

                    if response.status_code == 200:
                        result = response.json()
                        if result.get("success", False):
                            ocr_text = _strip_deepseek_noise(result.get("text", ""))
                            confidence = 0.95  # DeepSeek OCR is high accuracy
                        else:
                            raise HTTPException(
                                status_code=500,
                                detail=f"DeepSeek OCR failed: {result.get('message', 'Unknown error')}"
                            )
                    else:
                        raise HTTPException(
                            status_code=response.status_code,
                            detail=f"DeepSeek OCR failed: {response.text}"
                        )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="DeepSeek OCR request timed out")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"DeepSeek OCR error: {e}")
            raise HTTPException(status_code=500, detail=f"DeepSeek OCR processing failed: {str(e)}")

    else:
        # Use external OCR API (PP-OCR)
        if not ocr_api_health:
            raise HTTPException(status_code=503, detail="External OCR service is unavailable")

        try:
            # Build list of images to OCR (convert PDF pages if needed)
            pages: list = []
            if is_pdf:
                pdf_doc = fitz.open(stream=file_content, filetype="pdf")
                mat = fitz.Matrix(200 / 72, 200 / 72)
                for i in range(len(pdf_doc)):
                    pix = pdf_doc[i].get_pixmap(matrix=mat)
                    pages.append((f"page_{i + 1}.png", f"第 {i + 1} 頁", pix.tobytes("png")))
                pdf_doc.close()
            else:
                pages.append((file.filename or "image.png", None, file_content))

            if pages:
                async with httpx.AsyncClient(timeout=600) as client:
                    parts = []
                    confidences = []
                    sem = asyncio.Semaphore(2)
                    async def ocr_ppocr(fname, label, img_bytes):
                        async with sem:
                            files = {"file": (fname, img_bytes, "image/png" if is_pdf else content_type)}
                            data = {"model": model, "language": language}
                            try:
                                response = await client.post(
                                    f"{OCR_API_BASE_URL}/ocr/recognize",
                                    files=files,
                                    data=data,
                                )
                                if response.status_code == 200:
                                    result = response.json()
                                    t = (result.get("text") or "").strip()
                                    return (result.get("confidence", 0.9), f"--- {label} ---\n{t}" if label else t)
                                msg = f"[辨識失敗 {response.status_code}]"
                                return (0.0, f"--- {label} ---\n{msg}" if label else msg)
                            except httpx.TimeoutException:
                                msg = "[辨識失敗: 單頁超時]"
                                return (0.0, f"--- {label} ---\n{msg}" if label else msg)
                    results = await asyncio.gather(*(ocr_ppocr(f, l, b) for f, l, b in pages))
                    for c, txt in results:
                        if c > 0:
                            confidences.append(c)
                        parts.append(txt)
                    ocr_text = "\n\n".join(parts)
                    confidence = sum(confidences) / len(confidences) if confidences else 0.9
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="OCR request timed out")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"External OCR error: {e}")
            raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    processing_time = time.time() - start_time
    char_count = len(ocr_text)

    # Format output based on requested format
    def format_as_json():
        return {
            "text": ocr_text,
            "confidence": confidence,
            "char_count": char_count,
            "language": language,
            "model": model
        }

    def format_as_markdown():
        lines = ocr_text.split('\n')
        md_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped:
                # Simple heuristic: short lines might be titles
                if len(stripped) < 50 and not stripped.endswith(('。', '.', '，', ',', '：', ':')):
                    md_lines.append(f"## {stripped}")
                else:
                    md_lines.append(stripped)
            else:
                md_lines.append("")
        return '\n\n'.join(md_lines)

    # Build response
    response_data = {
        "success": True,
        "model": model,
        "model_name": model_info["name"],
        "processing_time_ms": round(processing_time * 1000, 2),
        "char_count": char_count,
        "confidence": confidence,
        "language": language
    }

    if output_format == "text":
        response_data["text"] = ocr_text
    elif output_format == "json":
        response_data["result"] = format_as_json()
    elif output_format == "markdown":
        response_data["markdown"] = format_as_markdown()
    elif output_format == "all":
        response_data["text"] = ocr_text
        response_data["result"] = format_as_json()
        response_data["markdown"] = format_as_markdown()
    else:
        response_data["text"] = ocr_text

    return JSONResponse(content=response_data)


def mask_endpoint(endpoint: str) -> str:
    """Mask IP address in endpoint for security"""
    # Convert http://host.docker.internal:21180/v1 to Endpoint-21180
    import re
    match = re.search(r':(\d{5})', endpoint)
    if match:
        return f"Endpoint-{match.group(1)}"
    return "Endpoint-unknown"


@app.get("/health")
async def health(user: Dict = Depends(get_current_user)):
    """Health check endpoint"""
    global deepseek_ocr_health

    # Check DeepSeek OCR health
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{DEEPSEEK_OCR_BASE_URL}/health", timeout=5)
            deepseek_ocr_health = response.status_code == 200
    except Exception:
        deepseek_ocr_health = False

    endpoints_status = {
        mask_endpoint(endpoint): "healthy" if health else "unhealthy"
        for endpoint, health in endpoint_health.items()
    }
    # Add DeepSeek status
    endpoints_status["DeepSeek-pj"] = "healthy" if deepseek_health else "unhealthy"
    # Add LLaVA vision model status
    endpoints_status["LLaVA-Local"] = "healthy" if qwen_vl_health else "unhealthy"
    # Add OCR API status
    endpoints_status["OCR-Service"] = "healthy" if ocr_api_health else "unhealthy"
    # Add DeepSeek OCR status
    endpoints_status["DeepSeek-OCR"] = "healthy" if deepseek_ocr_health else "unhealthy"

    return {
        "status": "healthy",
        "endpoints": endpoints_status
    }


@app.get("/api/conversations")
async def get_conversations(limit: int = 50, offset: int = 0, user: Dict = Depends(get_current_user)):
    """Get conversation history from MySQL"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get total count
                await cursor.execute("SELECT COUNT(*) as total FROM ollama_conversations")
                total_result = await cursor.fetchone()
                total = total_result["total"]

                # Get paginated conversations (newest first)
                await cursor.execute(
                    """SELECT id, timestamp, model, messages, response,
                              prompt_tokens, completion_tokens, total_tokens,
                              response_time_ms, success, user_id, username
                       FROM ollama_conversations
                       ORDER BY timestamp DESC
                       LIMIT %s OFFSET %s""",
                    (limit, offset)
                )
                rows = await cursor.fetchall()

                conversations = []
                for row in rows:
                    conversations.append({
                        "id": row["id"],
                        "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                        "model": row["model"],
                        "messages": json.loads(row["messages"]) if row["messages"] else [],
                        "response": row["response"],
                        "prompt_tokens": row["prompt_tokens"],
                        "completion_tokens": row["completion_tokens"],
                        "total_tokens": row["total_tokens"],
                        "response_time_ms": float(row["response_time_ms"]) if row["response_time_ms"] else 0,
                        "success": bool(row["success"]),
                        "user_id": row.get("user_id"),
                        "username": row.get("username")
                    })

                return {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "conversations": conversations
                }
    except Exception as e:
        logger.error(f"Failed to get conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: int, user: Dict = Depends(get_current_user)):
    """Get a specific conversation by ID from MySQL"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    """SELECT id, timestamp, model, messages, response,
                              prompt_tokens, completion_tokens, total_tokens,
                              response_time_ms, success, user_id, username
                       FROM ollama_conversations WHERE id = %s""",
                    (conversation_id,)
                )
                row = await cursor.fetchone()

                if not row:
                    raise HTTPException(status_code=404, detail="Conversation not found")

                return {
                    "id": row["id"],
                    "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                    "model": row["model"],
                    "messages": json.loads(row["messages"]) if row["messages"] else [],
                    "response": row["response"],
                    "prompt_tokens": row["prompt_tokens"],
                    "completion_tokens": row["completion_tokens"],
                    "total_tokens": row["total_tokens"],
                    "response_time_ms": float(row["response_time_ms"]) if row["response_time_ms"] else 0,
                    "success": bool(row["success"]),
                    "user_id": row.get("user_id"),
                    "username": row.get("username")
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/conversations")
async def clear_conversations(user: Dict = Depends(get_admin_user)):
    """Clear all conversation history from MySQL (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("DELETE FROM ollama_conversations")
                return {"message": "All conversations cleared"}
    except Exception as e:
        logger.error(f"Failed to clear conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_stats(user: Dict = Depends(get_current_user)):
    """Get usage statistics from ollama_conversations + api_keys"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Total requests from api_keys (authoritative cumulative count)
                await cursor.execute(
                    "SELECT COALESCE(SUM(request_count), 0) as total_requests FROM api_keys"
                )
                total_requests = int((await cursor.fetchone())["total_requests"])

                # Summary from conversations
                await cursor.execute(
                    """SELECT
                       COALESCE(SUM(prompt_tokens), 0) as total_tokens_prompt,
                       COALESCE(SUM(completion_tokens), 0) as total_tokens_completion,
                       COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) as errors_count,
                       COALESCE(AVG(response_time_ms), 0) as avg_response_time_ms
                       FROM ollama_conversations"""
                )
                summary = await cursor.fetchone()
                total_tokens_prompt = int(summary["total_tokens_prompt"])
                total_tokens_completion = int(summary["total_tokens_completion"])
                errors_count = int(summary["errors_count"])
                avg_response_time = float(summary["avg_response_time_ms"])

                # Model usage from conversations
                await cursor.execute(
                    """SELECT model, COUNT(*) as count
                       FROM ollama_conversations
                       GROUP BY model
                       ORDER BY count DESC"""
                )
                model_rows = await cursor.fetchall()
                by_model = {row["model"]: int(row["count"]) for row in model_rows}

                # Daily stats (last 30 days) from conversations
                await cursor.execute(
                    """SELECT DATE(timestamp) as date, COUNT(*) as count
                       FROM ollama_conversations
                       WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                       GROUP BY DATE(timestamp)
                       ORDER BY date"""
                )
                daily_rows = await cursor.fetchall()
                by_date = {row["date"].strftime("%Y-%m-%d"): int(row["count"])
                           for row in daily_rows}

                return {
                    "summary": {
                        "total_requests": total_requests,
                        "total_tokens": total_tokens_prompt + total_tokens_completion,
                        "total_tokens_prompt": total_tokens_prompt,
                        "total_tokens_completion": total_tokens_completion,
                        "errors_count": errors_count,
                        "success_rate": round(
                            (total_requests - errors_count) / max(total_requests, 1) * 100, 2
                        ),
                        "avg_response_time_ms": round(avg_response_time, 2)
                    },
                    "by_model": by_model,
                    "by_date": by_date
                }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== API Key Management Endpoints =====

class CreateApiKeyRequest(BaseModel):
    username: str
    description: Optional[str] = None
    is_admin: bool = False


class UpdateApiKeyRequest(BaseModel):
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


@app.get("/api/keys")
async def list_api_keys(admin: Dict = Depends(get_admin_user), include_all: bool = False):
    """List API keys (admin only). Filters out system/test accounts by default."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                if include_all:
                    await cursor.execute(
                        """SELECT id, username, api_key_prefix, is_admin, is_active,
                                  created_at, last_used_at, request_count, description
                           FROM api_keys ORDER BY request_count DESC, created_at DESC"""
                    )
                else:
                    # Filter out system accounts, test entries, and empty usernames
                    placeholders = ','.join(['%s'] * len(SYSTEM_USERNAMES))
                    await cursor.execute(
                        f"""SELECT id, username, api_key_prefix, is_admin, is_active,
                                  created_at, last_used_at, request_count, description
                           FROM api_keys
                           WHERE username NOT IN ({placeholders})
                             AND username IS NOT NULL
                             AND username != ''
                             AND username NOT LIKE 'e2e-%%'
                             AND username NOT LIKE 'c5-%%'
                           ORDER BY request_count DESC, created_at DESC""",
                        tuple(SYSTEM_USERNAMES)
                    )
                rows = await cursor.fetchall()

                keys = []
                for row in rows:
                    keys.append({
                        "id": row["id"],
                        "username": row["username"],
                        "api_key_prefix": row["api_key_prefix"] + "...",
                        "is_admin": bool(row["is_admin"]),
                        "is_active": bool(row["is_active"]),
                        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                        "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
                        "request_count": row["request_count"],
                        "description": row["description"]
                    })

                return {"keys": keys, "total": len(keys)}
    except Exception as e:
        logger.error(f"Failed to list API keys: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/keys")
async def create_api_key(request: CreateApiKeyRequest, admin: Dict = Depends(get_admin_user)):
    """Create a new API key (admin only)"""
    import re

    # Validate username
    username = request.username.strip()
    if len(username) < 2:
        raise HTTPException(status_code=400, detail="使用者名稱至少需要 2 個字元")
    if not re.match(r'^[\w-]+$', username):
        raise HTTPException(status_code=400, detail="使用者名稱僅允許英文、數字、底線、橫線及中文")
    if username.lower() in {u.lower() for u in SYSTEM_USERNAMES}:
        raise HTTPException(status_code=400, detail="此使用者名稱為系統保留名稱")

    # Validate description
    if not request.description or not request.description.strip():
        raise HTTPException(status_code=400, detail="請輸入用途描述（例如：專案名稱或系統名稱）")

    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Check if username already exists
                await cursor.execute(
                    "SELECT id FROM api_keys WHERE username = %s",
                    (username,)
                )
                if await cursor.fetchone():
                    raise HTTPException(status_code=400, detail=f"使用者 '{username}' 已存在")

                # Generate new API key
                api_key = generate_api_key()
                api_key_hash = hash_api_key(api_key)
                api_key_prefix = api_key[:8]

                await cursor.execute(
                    """INSERT INTO api_keys (username, api_key_hash, api_key_prefix, is_admin, description)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (username, api_key_hash, api_key_prefix, request.is_admin, request.description.strip())
                )

                # Get the created key ID
                await cursor.execute("SELECT LAST_INSERT_ID() as id")
                result = await cursor.fetchone()

                logger.info(f"API key created for user '{username}' by admin '{admin['username']}'")

                return {
                    "message": "API key created successfully",
                    "id": result["id"],
                    "username": username,
                    "api_key": api_key,
                    "note": "Please save this API key securely - it won't be shown again!"
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create API key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/keys/{key_id}")
async def get_api_key(key_id: int, admin: Dict = Depends(get_admin_user)):
    """Get API key details (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    """SELECT id, username, api_key_prefix, is_admin, is_active,
                              created_at, last_used_at, request_count, description
                       FROM api_keys WHERE id = %s""",
                    (key_id,)
                )
                row = await cursor.fetchone()

                if not row:
                    raise HTTPException(status_code=404, detail="API key not found")

                return {
                    "id": row["id"],
                    "username": row["username"],
                    "api_key_prefix": row["api_key_prefix"] + "...",
                    "is_admin": bool(row["is_admin"]),
                    "is_active": bool(row["is_active"]),
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
                    "request_count": row["request_count"],
                    "description": row["description"]
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get API key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/keys/{key_id}")
async def update_api_key(key_id: int, request: UpdateApiKeyRequest, admin: Dict = Depends(get_admin_user)):
    """Update API key settings (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Check if key exists
                await cursor.execute("SELECT id, username FROM api_keys WHERE id = %s", (key_id,))
                existing = await cursor.fetchone()
                if not existing:
                    raise HTTPException(status_code=404, detail="API key not found")

                # Build update query
                updates = []
                params = []

                if request.description is not None:
                    updates.append("description = %s")
                    params.append(request.description)
                if request.is_active is not None:
                    updates.append("is_active = %s")
                    params.append(request.is_active)
                if request.is_admin is not None:
                    updates.append("is_admin = %s")
                    params.append(request.is_admin)

                if not updates:
                    raise HTTPException(status_code=400, detail="No fields to update")

                params.append(key_id)
                await cursor.execute(
                    f"UPDATE api_keys SET {', '.join(updates)} WHERE id = %s",
                    params
                )

                logger.info(f"API key {key_id} (user: {existing['username']}) updated by admin '{admin['username']}'")

                return {"message": "API key updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update API key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/keys/{key_id}")
async def delete_api_key(key_id: int, admin: Dict = Depends(get_admin_user)):
    """Delete an API key (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Check if key exists and get info
                await cursor.execute("SELECT id, username, is_admin FROM api_keys WHERE id = %s", (key_id,))
                existing = await cursor.fetchone()
                if not existing:
                    raise HTTPException(status_code=404, detail="API key not found")

                # Prevent deleting the last admin
                if existing["is_admin"]:
                    await cursor.execute("SELECT COUNT(*) as count FROM api_keys WHERE is_admin = TRUE")
                    count = await cursor.fetchone()
                    if count["count"] <= 1:
                        raise HTTPException(status_code=400, detail="Cannot delete the last admin account")

                await cursor.execute("DELETE FROM api_keys WHERE id = %s", (key_id,))

                logger.info(f"API key {key_id} (user: {existing['username']}) deleted by admin '{admin['username']}'")

                return {"message": f"API key for user '{existing['username']}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete API key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/keys/{key_id}/regenerate")
async def regenerate_api_key(key_id: int, admin: Dict = Depends(get_admin_user)):
    """Regenerate an API key (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Check if key exists
                await cursor.execute("SELECT id, username FROM api_keys WHERE id = %s", (key_id,))
                existing = await cursor.fetchone()
                if not existing:
                    raise HTTPException(status_code=404, detail="API key not found")

                # Generate new API key
                api_key = generate_api_key()
                api_key_hash = hash_api_key(api_key)
                api_key_prefix = api_key[:8]

                await cursor.execute(
                    "UPDATE api_keys SET api_key_hash = %s, api_key_prefix = %s WHERE id = %s",
                    (api_key_hash, api_key_prefix, key_id)
                )

                logger.info(f"API key {key_id} (user: {existing['username']}) regenerated by admin '{admin['username']}'")

                return {
                    "message": "API key regenerated successfully",
                    "username": existing["username"],
                    "api_key": api_key,
                    "note": "Please save this API key securely - it won't be shown again!"
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to regenerate API key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
async def login(req: LoginRequest):
    """Validate login against MySQL system_users table"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    "SELECT id, username, is_admin, is_active FROM system_users WHERE username = %s AND password = %s",
                    (req.username, req.password)
                )
                user = await cursor.fetchone()
                if user:
                    if not user["is_active"]:
                        raise HTTPException(status_code=403, detail="帳號已被停用")

                    # Always generate a fresh API key on login (regenerate if exists)
                    user_api_key = MASTER_API_KEY  # fallback
                    try:
                        new_key = generate_api_key()
                        key_hash = hash_api_key(new_key)
                        key_prefix = new_key[:8]

                        await cursor.execute(
                            "SELECT id FROM api_keys WHERE username = %s",
                            (user["username"],)
                        )
                        existing_key = await cursor.fetchone()
                        if existing_key:
                            # Regenerate: update existing key and sync admin status
                            await cursor.execute(
                                "UPDATE api_keys SET api_key_hash = %s, api_key_prefix = %s, is_admin = %s, is_active = 1 WHERE id = %s",
                                (key_hash, key_prefix, bool(user["is_admin"]), existing_key["id"])
                            )
                        else:
                            # Create new key
                            await cursor.execute(
                                """INSERT INTO api_keys (username, api_key_hash, api_key_prefix, is_admin, description)
                                   VALUES (%s, %s, %s, %s, %s)""",
                                (user["username"], key_hash, key_prefix, bool(user["is_admin"]), "Auto-created on login")
                            )
                        user_api_key = new_key
                    except Exception as key_err:
                        logger.warning(f"Failed to manage user API key on login: {key_err}")

                    return {
                        "success": True,
                        "api_key": user_api_key,
                        "user": {
                            "id": user["id"],
                            "username": user["username"],
                            "is_admin": bool(user["is_admin"])
                        }
                    }
                else:
                    raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")


# ===== System User Management =====

class CreateUserRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class UpdateUserRequest(BaseModel):
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


@app.get("/api/system-users")
async def list_system_users(admin: Dict = Depends(get_admin_user)):
    """List all system users (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    "SELECT id, username, is_admin, is_active, created_at FROM system_users ORDER BY id"
                )
                users = await cursor.fetchall()
                return [
                    {
                        "id": u["id"],
                        "username": u["username"],
                        "is_admin": bool(u["is_admin"]),
                        "is_active": bool(u["is_active"]),
                        "created_at": str(u["created_at"])
                    }
                    for u in users
                ]
    except Exception as e:
        logger.error(f"Failed to list system users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/system-users")
async def create_system_user(req: CreateUserRequest, admin: Dict = Depends(get_admin_user)):
    """Create a new system user (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    "INSERT INTO system_users (username, password, is_admin) VALUES (%s, %s, %s)",
                    (req.username, req.password, req.is_admin)
                )
                return {"success": True, "message": f"使用者 '{req.username}' 已建立"}
    except Exception as e:
        if "Duplicate entry" in str(e):
            raise HTTPException(status_code=409, detail=f"使用者 '{req.username}' 已存在")
        logger.error(f"Failed to create system user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/system-users/{user_id}")
async def update_system_user(user_id: int, req: UpdateUserRequest, admin: Dict = Depends(get_admin_user)):
    """Update a system user (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        updates = []
        values = []
        if req.password is not None:
            updates.append("password = %s")
            values.append(req.password)
        if req.is_admin is not None:
            updates.append("is_admin = %s")
            values.append(req.is_admin)
        if req.is_active is not None:
            updates.append("is_active = %s")
            values.append(req.is_active)

        if not updates:
            raise HTTPException(status_code=400, detail="沒有要更新的欄位")

        values.append(user_id)
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    f"UPDATE system_users SET {', '.join(updates)} WHERE id = %s",
                    tuple(values)
                )
                if cursor.rowcount == 0:
                    raise HTTPException(status_code=404, detail="使用者不存在")
                return {"success": True, "message": "使用者已更新"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update system user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/system-users/{user_id}")
async def delete_system_user(user_id: int, admin: Dict = Depends(get_admin_user)):
    """Delete a system user (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("DELETE FROM system_users WHERE id = %s", (user_id,))
                if cursor.rowcount == 0:
                    raise HTTPException(status_code=404, detail="使用者不存在")
                return {"success": True, "message": "使用者已刪除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete system user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/me")
async def get_current_user_info(user: Dict = Depends(get_current_user)):
    """Get current user's info"""
    return {
        "id": user["id"],
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
        "request_count": user["request_count"],
        "permissions": user.get("permissions", {})
    }


# ===== User Permission Management =====

# Available features for permission control
AVAILABLE_FEATURES = ["chat", "speech", "ocr", "embeddings"]


class UpdatePermissionsRequest(BaseModel):
    allowed_models: Optional[List[str]] = None  # None = all models
    allowed_features: Optional[List[str]] = None  # None = all features
    daily_request_limit: int = 0  # 0 = unlimited
    daily_token_limit: int = 0  # 0 = unlimited


@app.get("/api/permissions")
async def list_all_permissions(admin: Dict = Depends(get_admin_user)):
    """List permissions for all users (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get all API key users with their permissions
                await cursor.execute("""
                    SELECT k.username, k.description, k.is_active, k.request_count,
                           p.allowed_models, p.allowed_features,
                           p.daily_request_limit, p.daily_token_limit
                    FROM api_keys k
                    LEFT JOIN user_permissions p ON k.username = p.username
                    WHERE k.username NOT IN (%s)
                      AND k.username IS NOT NULL AND k.username != ''
                      AND k.username NOT LIKE 'e2e-%%'
                      AND k.username NOT LIKE 'c5-%%'
                    ORDER BY k.request_count DESC
                """, tuple(SYSTEM_USERNAMES))
                rows = await cursor.fetchall()

                result = []
                for row in rows:
                    result.append({
                        "username": row["username"],
                        "description": row["description"],
                        "is_active": bool(row["is_active"]),
                        "request_count": row["request_count"],
                        "allowed_models": json.loads(row["allowed_models"]) if row["allowed_models"] else None,
                        "allowed_features": json.loads(row["allowed_features"]) if row["allowed_features"] else None,
                        "daily_request_limit": row["daily_request_limit"] or 0,
                        "daily_token_limit": row["daily_token_limit"] or 0,
                    })
                return {"users": result, "available_features": AVAILABLE_FEATURES}
    except Exception as e:
        logger.error(f"Failed to list permissions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/permissions/{username}")
async def get_user_permissions(username: str, admin: Dict = Depends(get_admin_user)):
    """Get permissions for a specific user (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    "SELECT * FROM user_permissions WHERE username = %s", (username,)
                )
                row = await cursor.fetchone()

                # Also get today's usage for limit display
                await cursor.execute(
                    """SELECT COUNT(*) as req_count FROM ollama_conversations
                       WHERE username = %s AND DATE(timestamp) = CURDATE()""",
                    (username,)
                )
                usage = await cursor.fetchone()

                if row:
                    return {
                        "username": username,
                        "allowed_models": json.loads(row["allowed_models"]) if row["allowed_models"] else None,
                        "allowed_features": json.loads(row["allowed_features"]) if row["allowed_features"] else None,
                        "daily_request_limit": row["daily_request_limit"] or 0,
                        "daily_token_limit": row["daily_token_limit"] or 0,
                        "today_requests": usage["req_count"] if usage else 0,
                        "available_features": AVAILABLE_FEATURES,
                    }
                else:
                    return {
                        "username": username,
                        "allowed_models": None,
                        "allowed_features": None,
                        "daily_request_limit": 0,
                        "daily_token_limit": 0,
                        "today_requests": usage["req_count"] if usage else 0,
                        "available_features": AVAILABLE_FEATURES,
                    }
    except Exception as e:
        logger.error(f"Failed to get permissions for {username}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/permissions/{username}")
async def update_user_permissions(username: str, req: UpdatePermissionsRequest, admin: Dict = Depends(get_admin_user)):
    """Update permissions for a user (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    # Validate features
    if req.allowed_features is not None:
        invalid = [f for f in req.allowed_features if f not in AVAILABLE_FEATURES]
        if invalid:
            raise HTTPException(status_code=400, detail=f"無效的功能: {invalid}. 可用: {AVAILABLE_FEATURES}")

    try:
        allowed_models_json = json.dumps(req.allowed_models, ensure_ascii=False) if req.allowed_models is not None else None
        allowed_features_json = json.dumps(req.allowed_features, ensure_ascii=False) if req.allowed_features is not None else None

        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                # Verify user exists in api_keys
                await cursor.execute("SELECT id FROM api_keys WHERE username = %s", (username,))
                if not await cursor.fetchone():
                    raise HTTPException(status_code=404, detail=f"使用者 '{username}' 不存在")

                # Upsert permission
                await cursor.execute("""
                    INSERT INTO user_permissions (username, allowed_models, allowed_features, daily_request_limit, daily_token_limit)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        allowed_models = VALUES(allowed_models),
                        allowed_features = VALUES(allowed_features),
                        daily_request_limit = VALUES(daily_request_limit),
                        daily_token_limit = VALUES(daily_token_limit)
                """, (username, allowed_models_json, allowed_features_json,
                      req.daily_request_limit, req.daily_token_limit))

                logger.info(f"Permissions updated for '{username}' by admin '{admin['username']}'")
                return {"success": True, "message": f"使用者 '{username}' 的權限已更新"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update permissions for {username}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/permissions/{username}")
async def reset_user_permissions(username: str, admin: Dict = Depends(get_admin_user)):
    """Reset user permissions to default (unlimited) (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("DELETE FROM user_permissions WHERE username = %s", (username,))
                return {"success": True, "message": f"使用者 '{username}' 的權限已重置為預設（無限制）"}
    except Exception as e:
        logger.error(f"Failed to reset permissions for {username}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== DeepSeek API Key Management =====

class UpdateDeepSeekKeyRequest(BaseModel):
    api_key: str


@app.get("/api/deepseek/config")
async def get_deepseek_config(admin: Dict = Depends(get_admin_user)):
    """Get DeepSeek API configuration (admin only)"""
    global DEEPSEEK_API_KEY

    # Check if API key is configured (don't show any part of the key)
    key_status = "已設定" if DEEPSEEK_API_KEY and len(DEEPSEEK_API_KEY) > 0 else "未設定"

    return {
        "api_key_status": key_status,
        "base_url": DEEPSEEK_BASE_URL,
        "models": DEEPSEEK_MODELS
    }


@app.put("/api/deepseek/config")
async def update_deepseek_config(request: UpdateDeepSeekKeyRequest, admin: Dict = Depends(get_admin_user)):
    """Update DeepSeek API Key (admin only)"""
    global DEEPSEEK_API_KEY

    new_key = request.api_key.strip()

    if not new_key:
        raise HTTPException(status_code=400, detail="API Key 不能為空")

    if not new_key.startswith("sk-"):
        raise HTTPException(status_code=400, detail="無效的 DeepSeek API Key 格式（應以 sk- 開頭）")

    # Verify the new key by checking balance
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.deepseek.com/user/balance",
                headers={"Authorization": f"Bearer {new_key}"},
                timeout=10
            )

            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="API Key 驗證失敗，請確認 Key 是否正確")

            balance_data = response.json()

            if not balance_data.get("is_available", False):
                # Still allow setting the key, but warn about balance
                logger.warning(f"DeepSeek API Key updated but account may have insufficient balance")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"無法連接到 DeepSeek API: {str(e)}")

    # Update the global variable
    old_key_masked = DEEPSEEK_API_KEY[:8] + "..." if DEEPSEEK_API_KEY else "無"
    DEEPSEEK_API_KEY = new_key

    # Save to .env file
    try:
        env_content = f"# DeepSeek API Configuration\nDEEPSEEK_API_KEY={new_key}\n"
        with open(ENV_FILE_PATH, 'w') as f:
            f.write(env_content)
        logger.info(f"DeepSeek API Key saved to {ENV_FILE_PATH}")
    except Exception as e:
        logger.error(f"Failed to save API Key to .env: {e}")
        # Still continue even if file write fails

    logger.info(f"DeepSeek API Key updated by admin '{admin['username']}'")

    return {
        "message": "DeepSeek API Key 更新成功（已保存到 .env）",
        "api_key_status": "已設定",
        "balance": balance_data
    }


@app.get("/api/deepseek/balance")
async def get_deepseek_balance(admin: Dict = Depends(get_admin_user)):
    """Get DeepSeek account balance (admin only)"""
    global DEEPSEEK_API_KEY

    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="DeepSeek API Key 未設定")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.deepseek.com/user/balance",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                timeout=10
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="無法獲取餘額資訊")

            data = response.json()

            # Parse balance info
            balance_info = {}
            for info in data.get("balance_infos", []):
                currency = info.get("currency", "")
                balance_info[currency] = {
                    "total": info.get("total_balance", "0"),
                    "granted": info.get("granted_balance", "0"),
                    "topped_up": info.get("topped_up_balance", "0")
                }

            return {
                "is_available": data.get("is_available", False),
                "balance": balance_info,
                "api_key_status": "已設定" if DEEPSEEK_API_KEY else "未設定"
            }
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"無法連接到 DeepSeek API: {str(e)}")


# ================================================================
# Usage logs (admin-only)
# ================================================================

@app.get("/api/usage")
async def list_usage_logs(
    admin: Dict = Depends(get_admin_user),
    username: Optional[str] = None,
    endpoint: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """List usage logs with optional filters."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    where = []
    params: List[Any] = []
    if username:
        where.append("username = %s")
        params.append(username)
    if endpoint:
        where.append("endpoint LIKE %s")
        params.append(f"%{endpoint}%")
    if start_date:
        where.append("request_at >= %s")
        params.append(start_date)
    if end_date:
        where.append("request_at <= %s")
        params.append(end_date)
    if status == "ok":
        where.append("status_code < 400")
    elif status == "error":
        where.append("status_code >= 400")

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(f"SELECT COUNT(*) AS c FROM usage_logs{where_sql}", params)
                total = (await cur.fetchone())["c"]

                await cur.execute(
                    f"""SELECT id, username, endpoint, method, model,
                              prompt_tokens, completion_tokens, total_tokens,
                              status_code, response_time_ms, ip_address,
                              error_message, request_at
                       FROM usage_logs{where_sql}
                       ORDER BY request_at DESC
                       LIMIT %s OFFSET %s""",
                    params + [limit, offset]
                )
                rows = await cur.fetchall()

        for r in rows:
            if r.get("request_at"):
                r["request_at"] = r["request_at"].isoformat()
        return {"total": total, "limit": limit, "offset": offset, "logs": rows}
    except Exception as e:
        logger.error(f"Failed to list usage logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/usage/summary")
async def usage_summary(
    admin: Dict = Depends(get_admin_user),
    days: int = 7,
):
    """Aggregated stats: per-user totals + per-endpoint breakdown for the last N days."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    days = max(1, min(days, 90))

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    """SELECT
                          COALESCE(username, '(anonymous)') AS username,
                          COUNT(*) AS requests,
                          SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors,
                          SUM(total_tokens) AS tokens,
                          AVG(response_time_ms) AS avg_ms,
                          MAX(request_at) AS last_used
                       FROM usage_logs
                       WHERE request_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                       GROUP BY username
                       ORDER BY requests DESC""",
                    (days,)
                )
                per_user = await cur.fetchall()

                await cur.execute(
                    """SELECT endpoint,
                              COUNT(*) AS requests,
                              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors
                       FROM usage_logs
                       WHERE request_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                       GROUP BY endpoint
                       ORDER BY requests DESC""",
                    (days,)
                )
                per_endpoint = await cur.fetchall()

        for r in per_user:
            if r.get("last_used"):
                r["last_used"] = r["last_used"].isoformat()
            r["avg_ms"] = float(r["avg_ms"]) if r["avg_ms"] is not None else 0
            r["tokens"] = int(r["tokens"] or 0)

        return {
            "days": days,
            "per_user": per_user,
            "per_endpoint": per_endpoint,
            "retention_days": USAGE_LOG_RETENTION_DAYS,
        }
    except Exception as e:
        logger.error(f"Failed to compute usage summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/usage")
async def prune_usage_logs(
    admin: Dict = Depends(get_admin_user),
    older_than_days: Optional[int] = None,
):
    """Manually prune usage_logs.
    older_than_days defaults to USAGE_LOG_RETENTION_DAYS.
    Pass older_than_days=0 to delete everything."""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    if older_than_days is None:
        older_than_days = USAGE_LOG_RETENTION_DAYS
    if older_than_days < 0:
        raise HTTPException(status_code=400, detail="older_than_days must be >= 0")

    try:
        if older_than_days == 0:
            async with db_pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("DELETE FROM usage_logs")
                    deleted = cur.rowcount or 0
        else:
            deleted = await _prune_usage_logs(older_than_days)

        logger.info(f"Admin '{admin['username']}' pruned {deleted} usage_logs rows (older_than_days={older_than_days})")
        return {"deleted": deleted, "older_than_days": older_than_days}
    except Exception as e:
        logger.error(f"Failed to prune usage_logs manually: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8777)