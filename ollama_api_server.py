from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Depends, Header
from fastapi.responses import StreamingResponse, JSONResponse, HTMLResponse
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

# Configuration
OLLAMA_ENDPOINTS = [
    "http://192.168.31.156:21180/v1",
    "http://192.168.31.156:21182/v1",
    "http://192.168.31.156:21183/v1",
    "http://192.168.31.156:21185/v1",
]

# Model to endpoint mapping - each model routes to its specific llama.cpp server
MODEL_ENDPOINT_MAP = {
    "gpt-oss:120b": "http://192.168.31.156:21180/v1",
    "Qwen3-Embedding-8B": "http://192.168.31.156:21182/v1",
    "bge-reranker-v2-m3": "http://192.168.31.156:21183/v1",
    "Qwen3.5:122b": "http://192.168.31.156:21185/v1",
}

API_KEY = "paVrIT+XU1NhwCAOb0X4aYi75QKogK5YNMGvQF1dCyo="

# DeepSeek API Configuration
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"]
ENV_FILE_PATH = "/app/.env"  # Path to .env file in container

# SiliconFlow API Configuration
SILICONFLOW_API_KEY = os.environ.get("SILICONFLOW_API_KEY", "sk-pnbzvludlmtciiaqgiactcltbxxmmvtfekoadqjlphyvkslw")
SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1"
SILICONFLOW_MODELS = [
    # DeepSeek 系列
    "deepseek-ai/DeepSeek-R1",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    "deepseek-ai/DeepSeek-V3",
    "deepseek-ai/DeepSeek-V3.1",
    "deepseek-ai/DeepSeek-V3.2",
    "deepseek-ai/deepseek-vl2",
    "Pro/deepseek-ai/DeepSeek-R1",
    "Pro/deepseek-ai/DeepSeek-V3",
    # Qwen 通義千問系列
    "Qwen/QwQ-32B",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-14B-Instruct",
    "Qwen/Qwen2.5-32B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct-128K",
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "Qwen/Qwen2.5-VL-7B-Instruct",
    "Qwen/Qwen2.5-VL-32B-Instruct",
    "Qwen/Qwen2.5-VL-72B-Instruct",
    "Qwen/Qwen3-8B",
    "Qwen/Qwen3-14B",
    "Qwen/Qwen3-32B",
    "Qwen/Qwen3-30B-A3B",
    "Qwen/Qwen3-235B-A22B",
    "Qwen/Qwen3-235B-A22B-Thinking-2507",
    "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    # GLM 智譜系列
    "THUDM/GLM-4-9B-0414",
    "THUDM/GLM-4-32B-0414",
    "THUDM/GLM-Z1-9B-0414",
    "THUDM/GLM-Z1-32B-0414",
    "THUDM/GLM-4.1V-9B-Thinking",
    "zai-org/GLM-4.5",
    "zai-org/GLM-4.5-Air",
    "zai-org/GLM-4.5V",
    "zai-org/GLM-4.6",
    "zai-org/GLM-4.6V",
    "zai-org/GLM-4.7",
    # Kimi 月之暗面系列
    "moonshotai/Kimi-K2-Instruct",
    "moonshotai/Kimi-K2-Thinking",
    "moonshotai/Kimi-Dev-72B",
    # 其他模型
    "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "MiniMaxAI/MiniMax-M1-80k",
    "MiniMaxAI/MiniMax-M2",
    "tencent/Hunyuan-A13B-Instruct",
    "baidu/ERNIE-4.5-300B-A47B",
    "ByteDance-Seed/Seed-OSS-36B-Instruct",
    "stepfun-ai/step3",
]

# Vision Model Configuration (Local Ollama via Docker host)
QWEN_VL_BASE_URL = "http://host.docker.internal:11434/v1"
QWEN_VL_MODELS = ["llava:7b"]

# Local Ollama Models (text models running on local Ollama)
OLLAMA_LOCAL_BASE_URL = "http://host.docker.internal:11434/v1"
OLLAMA_LOCAL_MODELS = ["qwen2.5:72b"]

# Speech-to-Text API Configuration
SPEECH_API_BASE_URL = "http://192.168.31.156:8131"

# OCR Configuration
OCR_API_BASE_URL = "http://pp-ocr-service:8132"  # PP-OCR service in Docker network
DEEPSEEK_OCR_BASE_URL = "http://192.168.0.191:8001"  # DeepSeek OCR service on external server
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
    "gpt-oss-safeguard:20b": {
        "name": "GPT-OSS Safeguard 20B",
        "type": "local",
        "description": "輕量級安全模型，回應速度快，適合一般對話",
        "features": ["20B 參數", "快速回應", "安全過濾", "低資源消耗"],
        "best_for": "日常對話、快速問答、內容審核、客服應用",
        "context_length": "131K tokens"
    },
    "Qwen3.5:122b": {
        "name": "Qwen 3.5 122B (MoE)",
        "type": "local",
        "description": "通義千問 3.5 MoE 模型，122B 參數 10B 激活，兼具高性能與高效率",
        "features": ["122B 參數", "MoE 架構", "256K 上下文", "FP8 量化"],
        "best_for": "複雜推理、程式碼生成、多語言對話、長文本分析",
        "context_length": "256K tokens"
    },
    "qwen2.5:72b": {
        "name": "Qwen 2.5 72B",
        "type": "local",
        "description": "阿里通義千問最新模型，中文能力頂尖",
        "features": ["72B 參數", "頂尖中文能力", "程式碼專精", "數學推理強"],
        "best_for": "中文寫作、程式開發、數學計算、知識問答",
        "context_length": "32K tokens"
    },
    "llava:7b": {
        "name": "LLaVA 7B (視覺)",
        "type": "local",
        "description": "本地視覺語言模型，支援圖片理解與多模態對話",
        "features": ["7B 參數", "視覺理解", "圖片分析", "本地運行"],
        "best_for": "圖片描述、視覺問答、圖表分析、即時處理",
        "context_length": "4K tokens"
    },
    # 雲端模型 - DeepSeek API
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
    # SiliconFlow Models - DeepSeek 系列
    "deepseek-ai/DeepSeek-R1": {
        "name": "DeepSeek R1 (SiliconFlow)",
        "description": "DeepSeek 推理模型，強大的邏輯推理與思維鏈能力",
        "features": ["深度推理", "思維鏈", "數學專精", "代碼生成"],
        "best_for": "複雜推理、數學證明、程式設計、邏輯分析",
        "context_length": "64K tokens"
    },
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B": {
        "name": "DeepSeek R1 Distill 7B (SiliconFlow)",
        "description": "DeepSeek R1 蒸餾版 7B，輕量級推理模型",
        "features": ["7B 參數", "快速推理", "低成本", "高性價比"],
        "best_for": "快速推理、輕量部署、成本敏感場景",
        "context_length": "32K tokens"
    },
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B": {
        "name": "DeepSeek R1 Distill 14B (SiliconFlow)",
        "description": "DeepSeek R1 蒸餾版 14B，平衡的推理模型",
        "features": ["14B 參數", "平衡性能", "推理能力", "成本效益"],
        "best_for": "中等複雜度推理、一般分析任務",
        "context_length": "32K tokens"
    },
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B": {
        "name": "DeepSeek R1 Distill 32B (SiliconFlow)",
        "description": "DeepSeek R1 蒸餾版 32B，強大的推理模型",
        "features": ["32B 參數", "強大推理", "高精度", "思維鏈"],
        "best_for": "複雜推理、數學問題、程式設計",
        "context_length": "32K tokens"
    },
    "deepseek-ai/DeepSeek-V3": {
        "name": "DeepSeek V3 (SiliconFlow)",
        "description": "DeepSeek 最新版通用模型，全面升級的對話能力",
        "features": ["通用對話", "多語言", "長文本", "高效能"],
        "best_for": "日常對話、文本生成、翻譯、摘要",
        "context_length": "128K tokens"
    },
    "deepseek-ai/DeepSeek-V3.1": {
        "name": "DeepSeek V3.1 (SiliconFlow)",
        "description": "DeepSeek V3 升級版，更強的對話與理解能力",
        "features": ["升級版本", "增強理解", "更穩定", "多場景"],
        "best_for": "複雜對話、長文本處理、專業問答",
        "context_length": "128K tokens"
    },
    "deepseek-ai/DeepSeek-V3.2": {
        "name": "DeepSeek V3.2 (SiliconFlow)",
        "description": "DeepSeek V3 最新版，頂尖的開源大語言模型",
        "features": ["最新版本", "頂尖性能", "全面優化", "高效率"],
        "best_for": "所有通用場景、高品質輸出需求",
        "context_length": "128K tokens"
    },
    "deepseek-ai/deepseek-vl2": {
        "name": "DeepSeek VL2 (SiliconFlow)",
        "description": "DeepSeek 視覺語言模型，支援圖片理解",
        "features": ["視覺理解", "圖片分析", "多模態", "文字識別"],
        "best_for": "圖片描述、視覺問答、文檔分析、圖表理解",
        "context_length": "32K tokens"
    },
    "Pro/deepseek-ai/DeepSeek-R1": {
        "name": "DeepSeek R1 Pro (SiliconFlow)",
        "description": "DeepSeek R1 專業版，更穩定的推理服務",
        "features": ["專業版", "高可用", "穩定推理", "優先隊列"],
        "best_for": "企業應用、生產環境、穩定需求、專業任務",
        "context_length": "64K tokens"
    },
    "Pro/deepseek-ai/DeepSeek-V3": {
        "name": "DeepSeek V3 Pro (SiliconFlow)",
        "description": "DeepSeek V3 專業版，企業級穩定服務",
        "features": ["專業版", "高可用", "穩定服務", "優先隊列"],
        "best_for": "企業應用、生產環境、穩定需求、批量處理",
        "context_length": "128K tokens"
    },
    # SiliconFlow Models - Qwen 通義千問系列
    "Qwen/QwQ-32B": {
        "name": "Qwen QwQ 32B (SiliconFlow)",
        "description": "阿里通義千問推理模型，專注邏輯思考與問題解決",
        "features": ["32B 參數", "推理專精", "中文優化", "思維鏈"],
        "best_for": "邏輯推理、問題分析、決策支援、教育輔導",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen2.5-7B-Instruct": {
        "name": "Qwen 2.5 7B (SiliconFlow)",
        "description": "通義千問輕量指令模型，快速高效（免費）",
        "features": ["7B 參數", "免費使用", "快速回應", "低延遲"],
        "best_for": "快速問答、日常對話、輕量應用",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen2.5-14B-Instruct": {
        "name": "Qwen 2.5 14B (SiliconFlow)",
        "description": "通義千問中型指令模型，平衡性能與成本",
        "features": ["14B 參數", "平衡性能", "多任務", "高性價比"],
        "best_for": "一般問答、文本處理、內容生成",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen2.5-32B-Instruct": {
        "name": "Qwen 2.5 32B (SiliconFlow)",
        "description": "通義千問大型指令模型，強大的理解能力",
        "features": ["32B 參數", "強大理解", "指令跟隨", "多語言"],
        "best_for": "複雜問答、專業寫作、深度分析",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen2.5-72B-Instruct": {
        "name": "Qwen 2.5 72B (SiliconFlow)",
        "description": "通義千問大規模指令模型，頂尖中文理解能力",
        "features": ["72B 參數", "指令跟隨", "中文頂尖", "多任務"],
        "best_for": "中文寫作、複雜指令、知識問答、內容創作",
        "context_length": "128K tokens"
    },
    "Qwen/Qwen2.5-72B-Instruct-128K": {
        "name": "Qwen 2.5 72B 128K (SiliconFlow)",
        "description": "通義千問超長上下文版本，支援 128K 上下文",
        "features": ["72B 參數", "128K 上下文", "長文本", "文檔分析"],
        "best_for": "長文檔處理、書籍分析、大量資料整合",
        "context_length": "128K tokens"
    },
    "Qwen/Qwen2.5-Coder-32B-Instruct": {
        "name": "Qwen 2.5 Coder 32B (SiliconFlow)",
        "description": "通義千問程式碼專用模型，專為開發者設計",
        "features": ["程式碼專精", "多語言程式", "代碼審查", "除錯輔助"],
        "best_for": "程式開發、代碼補全、Bug 修復、程式碼解釋",
        "context_length": "128K tokens"
    },
    "Qwen/Qwen2.5-VL-7B-Instruct": {
        "name": "Qwen 2.5 VL 7B (SiliconFlow)",
        "description": "通義千問視覺語言模型輕量版，支援圖片理解",
        "features": ["7B 參數", "視覺理解", "圖片分析", "快速處理"],
        "best_for": "簡單圖片問答、快速視覺分析",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen2.5-VL-32B-Instruct": {
        "name": "Qwen 2.5 VL 32B (SiliconFlow)",
        "description": "通義千問視覺語言模型中型版，強大的圖片理解",
        "features": ["32B 參數", "視覺理解", "多模態", "高精度"],
        "best_for": "圖片描述、視覺問答、圖表分析",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen2.5-VL-72B-Instruct": {
        "name": "Qwen 2.5 VL 72B (SiliconFlow)",
        "description": "通義千問視覺語言模型大型版，頂尖視覺理解",
        "features": ["72B 參數", "頂尖視覺", "複雜分析", "多模態"],
        "best_for": "複雜圖片分析、專業視覺任務、文檔OCR",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen3-8B": {
        "name": "Qwen 3 8B (SiliconFlow)",
        "description": "通義千問 3 代輕量版，新一代架構（免費）",
        "features": ["8B 參數", "免費使用", "新架構", "快速"],
        "best_for": "快速對話、輕量部署、一般問答",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen3-14B": {
        "name": "Qwen 3 14B (SiliconFlow)",
        "description": "通義千問 3 代中型版，平衡性能與效率",
        "features": ["14B 參數", "新架構", "多任務", "高效率"],
        "best_for": "一般對話、文本生成、知識問答",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen3-32B": {
        "name": "Qwen 3 32B (SiliconFlow)",
        "description": "通義千問 3 代大型版，強大的推理能力",
        "features": ["32B 參數", "強推理", "新架構", "多場景"],
        "best_for": "複雜推理、專業問答、內容創作",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen3-30B-A3B": {
        "name": "Qwen 3 30B MoE (SiliconFlow)",
        "description": "通義千問 3 代 MoE 架構，高效能低成本",
        "features": ["MoE 架構", "30B 總參數", "高效率", "低成本"],
        "best_for": "高性價比需求、大規模應用",
        "context_length": "32K tokens"
    },
    "Qwen/Qwen3-235B-A22B": {
        "name": "Qwen 3 235B (SiliconFlow)",
        "description": "通義千問最強模型，2350 億參數的超大規模語言模型",
        "features": ["235B 參數", "頂尖性能", "MoE 架構", "全能型"],
        "best_for": "最複雜任務、研究分析、專業諮詢、深度創作",
        "context_length": "128K tokens"
    },
    "Qwen/Qwen3-235B-A22B-Thinking-2507": {
        "name": "Qwen 3 235B Thinking (SiliconFlow)",
        "description": "通義千問 235B 思考版，強化推理與思維鏈",
        "features": ["235B 參數", "深度思考", "推理增強", "思維鏈"],
        "best_for": "複雜推理、數學問題、邏輯分析",
        "context_length": "128K tokens"
    },
    "Qwen/Qwen3-Coder-480B-A35B-Instruct": {
        "name": "Qwen 3 Coder 480B (SiliconFlow)",
        "description": "通義千問最強程式碼模型，4800 億參數",
        "features": ["480B 參數", "程式碼頂尖", "多語言", "MoE"],
        "best_for": "複雜程式開發、架構設計、代碼審查",
        "context_length": "128K tokens"
    },
    # SiliconFlow Models - GLM 智譜系列
    "THUDM/GLM-4-9B-0414": {
        "name": "GLM-4 9B (SiliconFlow)",
        "description": "智譜 GLM-4 輕量版，高效能的中文對話模型",
        "features": ["9B 參數", "快速回應", "中文優化", "低資源"],
        "best_for": "快速對話、輕量部署、一般問答、日常使用",
        "context_length": "128K tokens"
    },
    "THUDM/GLM-4-32B-0414": {
        "name": "GLM-4 32B (SiliconFlow)",
        "description": "智譜 GLM-4 大型版，強大的中文理解能力",
        "features": ["32B 參數", "強理解", "中文優化", "多任務"],
        "best_for": "複雜問答、專業寫作、深度分析",
        "context_length": "128K tokens"
    },
    "THUDM/GLM-Z1-9B-0414": {
        "name": "GLM-Z1 9B (SiliconFlow)",
        "description": "智譜 GLM-Z1 推理版，專注邏輯推理",
        "features": ["9B 參數", "推理專精", "思維鏈", "快速"],
        "best_for": "快速推理、邏輯問題、數學計算",
        "context_length": "128K tokens"
    },
    "THUDM/GLM-Z1-32B-0414": {
        "name": "GLM-Z1 32B (SiliconFlow)",
        "description": "智譜 GLM-Z1 推理版大型，強大推理能力",
        "features": ["32B 參數", "深度推理", "思維鏈", "高精度"],
        "best_for": "複雜推理、數學證明、專業分析",
        "context_length": "128K tokens"
    },
    "THUDM/GLM-4.1V-9B-Thinking": {
        "name": "GLM-4.1V 9B Thinking (SiliconFlow)",
        "description": "智譜視覺思考模型，支援圖片理解與推理",
        "features": ["視覺理解", "思維鏈", "圖片分析", "推理"],
        "best_for": "圖片推理、視覺問答、複雜視覺任務",
        "context_length": "32K tokens"
    },
    "zai-org/GLM-4.5": {
        "name": "GLM-4.5 (SiliconFlow)",
        "description": "智譜 GLM-4.5 最新版，全面升級的大語言模型",
        "features": ["最新版本", "全面升級", "高性能", "多場景"],
        "best_for": "通用對話、專業問答、內容創作",
        "context_length": "128K tokens"
    },
    "zai-org/GLM-4.5-Air": {
        "name": "GLM-4.5 Air (SiliconFlow)",
        "description": "智譜 GLM-4.5 輕量版，快速高效的選擇",
        "features": ["輕量版", "快速回應", "低延遲", "高效率"],
        "best_for": "快速對話、即時回應、輕量應用",
        "context_length": "128K tokens"
    },
    "zai-org/GLM-4.5V": {
        "name": "GLM-4.5V (SiliconFlow)",
        "description": "智譜 GLM-4.5 視覺版，支援圖片理解",
        "features": ["視覺理解", "圖片分析", "多模態", "最新版"],
        "best_for": "圖片描述、視覺問答、文檔分析",
        "context_length": "32K tokens"
    },
    "zai-org/GLM-4.6": {
        "name": "GLM-4.6 (SiliconFlow)",
        "description": "智譜 GLM-4.6 升級版，增強的對話能力",
        "features": ["升級版", "增強對話", "更穩定", "高品質"],
        "best_for": "專業對話、複雜問答、內容生成",
        "context_length": "128K tokens"
    },
    "zai-org/GLM-4.6V": {
        "name": "GLM-4.6V (SiliconFlow)",
        "description": "智譜 GLM-4.6 視覺版，強大的視覺理解",
        "features": ["視覺升級", "強理解", "多模態", "高精度"],
        "best_for": "複雜圖片分析、專業視覺任務、OCR",
        "context_length": "32K tokens"
    },
    "zai-org/GLM-4.7": {
        "name": "GLM-4.7 (SiliconFlow)",
        "description": "智譜 GLM-4.7 最新版，頂尖的中文大語言模型",
        "features": ["最新版本", "頂尖性能", "全面優化", "多場景"],
        "best_for": "所有中文場景、高品質輸出需求",
        "context_length": "128K tokens"
    },
    # SiliconFlow Models - Kimi 月之暗面系列
    "moonshotai/Kimi-K2-Instruct": {
        "name": "Kimi K2 Instruct (SiliconFlow)",
        "description": "月之暗面 Kimi K2 指令版，強大的長文本處理",
        "features": ["長文本", "指令跟隨", "深度理解", "多輪對話"],
        "best_for": "長文檔分析、複雜指令、專業問答",
        "context_length": "128K tokens"
    },
    "moonshotai/Kimi-K2-Thinking": {
        "name": "Kimi K2 Thinking (SiliconFlow)",
        "description": "月之暗面 Kimi K2 思考版，強化推理能力",
        "features": ["深度思考", "推理增強", "思維鏈", "高精度"],
        "best_for": "複雜推理、數學問題、邏輯分析",
        "context_length": "128K tokens"
    },
    "moonshotai/Kimi-Dev-72B": {
        "name": "Kimi Dev 72B (SiliconFlow)",
        "description": "月之暗面開發者版，專為程式開發設計",
        "features": ["72B 參數", "程式碼專精", "開發者向", "代碼生成"],
        "best_for": "程式開發、代碼審查、技術問答",
        "context_length": "128K tokens"
    },
    # SiliconFlow Models - 其他模型
    "meta-llama/Meta-Llama-3.1-8B-Instruct": {
        "name": "Llama 3.1 8B (SiliconFlow)",
        "description": "Meta Llama 3.1 輕量版，開源大語言模型",
        "features": ["8B 參數", "開源", "多語言", "快速"],
        "best_for": "快速對話、英文處理、輕量應用",
        "context_length": "128K tokens"
    },
    "MiniMaxAI/MiniMax-M1-80k": {
        "name": "MiniMax M1 80K (SiliconFlow)",
        "description": "MiniMax M1 長上下文版，80K 上下文窗口",
        "features": ["80K 上下文", "長文本", "高效率", "多任務"],
        "best_for": "長文檔處理、大量資料分析",
        "context_length": "80K tokens"
    },
    "MiniMaxAI/MiniMax-M2": {
        "name": "MiniMax M2 (SiliconFlow)",
        "description": "MiniMax 最新模型，強大的通用能力",
        "features": ["最新版", "通用能力", "高性能", "多場景"],
        "best_for": "通用對話、內容創作、知識問答",
        "context_length": "128K tokens"
    },
    "tencent/Hunyuan-A13B-Instruct": {
        "name": "騰訊混元 13B (SiliconFlow)",
        "description": "騰訊混元大語言模型，中文優化",
        "features": ["13B 參數", "中文優化", "騰訊出品", "多任務"],
        "best_for": "中文對話、內容生成、知識問答",
        "context_length": "32K tokens"
    },
    "baidu/ERNIE-4.5-300B-A47B": {
        "name": "文心一言 4.5 300B (SiliconFlow)",
        "description": "百度文心一言最強模型，3000 億參數",
        "features": ["300B 參數", "中文頂尖", "百度出品", "全能型"],
        "best_for": "複雜中文任務、專業問答、深度創作",
        "context_length": "128K tokens"
    },
    "ByteDance-Seed/Seed-OSS-36B-Instruct": {
        "name": "字節 Seed 36B (SiliconFlow)",
        "description": "字節跳動 Seed 開源模型，強大的通用能力",
        "features": ["36B 參數", "開源", "字節出品", "多任務"],
        "best_for": "通用對話、內容創作、多場景應用",
        "context_length": "32K tokens"
    },
    "stepfun-ai/step3": {
        "name": "階躍星辰 Step3 (SiliconFlow)",
        "description": "階躍星辰 Step3 模型，專注對話與創作",
        "features": ["新一代", "對話優化", "創作能力", "多輪對話"],
        "best_for": "對話交互、內容創作、角色扮演",
        "context_length": "32K tokens"
    }
}

# Track endpoint health
endpoint_health = {endpoint: True for endpoint in OLLAMA_ENDPOINTS}
deepseek_health = True
siliconflow_health = True
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

# Default admin account
DEFAULT_ADMIN = {
    "username": "zhpjaiaoi",
    "api_key": None,  # Will be generated on first run
    "is_admin": True
}

# Fallback master API key (used when database is unavailable)
MASTER_API_KEY = os.environ.get("MASTER_API_KEY", "pj-admin-zhpjaiaoi-2024")


def generate_api_key() -> str:
    """Generate a secure random API key"""
    return secrets.token_urlsafe(32)


def hash_api_key(api_key: str) -> str:
    """Hash an API key for secure storage"""
    return hashlib.sha256(api_key.encode()).hexdigest()


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
            "request_count": 0
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
                    return user
                return None
    except Exception as e:
        logger.error(f"Failed to validate API key: {e}")
        # Fallback to master key check already done above
        return None


async def get_current_user(
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

        # Initialize API keys table and admin account
        await init_api_keys_table()
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

                # Update daily stats
                error_increment = 0 if success else 1
                await cursor.execute(
                    """INSERT INTO ollama_daily_stats
                       (date, total_requests, total_tokens_prompt, total_tokens_completion,
                        errors_count, avg_response_time_ms)
                       VALUES (%s, 1, %s, %s, %s, %s)
                       ON DUPLICATE KEY UPDATE
                       total_requests = total_requests + 1,
                       total_tokens_prompt = total_tokens_prompt + %s,
                       total_tokens_completion = total_tokens_completion + %s,
                       errors_count = errors_count + %s,
                       avg_response_time_ms = (avg_response_time_ms * (total_requests - 1) + %s) / total_requests""",
                    (today, prompt_tokens, completion_tokens, error_increment, response_time_ms,
                     prompt_tokens, completion_tokens, error_increment, response_time_ms)
                )

                # Update model stats
                await cursor.execute(
                    """INSERT INTO ollama_model_stats (date, model, request_count)
                       VALUES (%s, %s, 1)
                       ON DUPLICATE KEY UPDATE request_count = request_count + 1""",
                    (today, model)
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

def get_available_endpoint(model: str = None):
    """Get endpoint for a specific model, or random available endpoint if model not specified.

    Args:
        model: The model name to route to. If specified and found in MODEL_ENDPOINT_MAP,
               returns the dedicated endpoint for that model.

    Returns:
        The endpoint URL string, or None if no endpoints available.
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

    # Fallback: random selection from available endpoints (for unknown models)
    available = [ep for ep in OLLAMA_ENDPOINTS if endpoint_health.get(ep, True)]

    if not available:
        # If no endpoints are marked as healthy, try all endpoints
        available = OLLAMA_ENDPOINTS

    return random.choice(available) if available else None

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
    try:
        with open("index.html", "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
        return {
            "message": "Ollama API Gateway",
            "endpoints": len(OLLAMA_ENDPOINTS),
            "healthy_endpoints": sum(1 for v in endpoint_health.values() if v)
        }

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

    # Add SiliconFlow models (static list since API may not provide /models endpoint)
    global siliconflow_health
    try:
        for model_id in SILICONFLOW_MODELS:
            model_data = {
                "id": model_id,
                "object": "model",
                "created": 1700000000,
                "owned_by": "siliconflow"
            }
            all_models.add(json.dumps(model_data, sort_keys=True))
        siliconflow_health = True
    except Exception as e:
        siliconflow_health = False
        errors.append(f"Error adding SiliconFlow models: {str(e)}")

    if not all_models and errors:
        raise HTTPException(status_code=503, detail="All endpoints failed: " + "; ".join(errors))

    # Parse unique models back to dicts and filter hidden models
    unique_models = [json.loads(m) for m in all_models]
    filtered_models = [m for m in unique_models if m.get("id") not in HIDDEN_MODELS]

    # Add model info/descriptions and type classification
    for model in filtered_models:
        model_id = model.get("id")
        owned_by = model.get("owned_by", "")

        # Add model info if available
        if model_id in MODEL_INFO:
            model["info"] = MODEL_INFO[model_id]

        # Auto-classify model type based on source
        if owned_by == "siliconflow" or model_id in SILICONFLOW_MODELS:
            model["deployment_type"] = "cloud"
            model["provider"] = "SiliconFlow"
        elif model_id in DEEPSEEK_MODELS:
            model["deployment_type"] = "cloud"
            model["provider"] = "DeepSeek"
        elif model_id in QWEN_VL_MODELS or model_id in OLLAMA_LOCAL_MODELS:
            model["deployment_type"] = "local"
            model["provider"] = "Ollama"
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


def clean_deepseek_r1_response(content: str) -> str:
    """Clean DeepSeek-R1 thinking tokens from response content.

    DeepSeek-R1 outputs thinking process with special tokens like:
    1. <think>...</think> format (common format)
    2. <|channel|>analysis<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>... format

    This function extracts only the final response.
    """
    import re

    if not content:
        return content

    # Pattern 1: Handle <think>...</think> format
    if '<think>' in content:
        # Remove <think>...</think> block and keep the rest
        cleaned = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
        cleaned = cleaned.strip()
        if cleaned:
            return cleaned
        # If nothing left after removing think block, the thinking was incomplete
        # Return content after </think> if exists, otherwise return as-is
        if '</think>' in content:
            parts = content.split('</think>', 1)
            if len(parts) > 1 and parts[1].strip():
                return parts[1].strip()

    # Pattern 2: Handle <|channel|>...<|message|>... format
    if '<|channel|>' in content or '<|message|>' in content:
        # Try to extract the final response after <|channel|>final<|message|>
        final_pattern = r'<\|channel\|>final<\|message\|>(.*?)(?:<\|end\|>|$)'
        final_match = re.search(final_pattern, content, re.DOTALL)

        if final_match:
            return final_match.group(1).strip()

        # Fallback: remove all thinking tokens and keep the rest
        cleaned = re.sub(r'<\|[^|]+\|>', '', content)
        return cleaned.strip()

    return content


async def forward_to_siliconflow(request_data: dict, stream: bool = False):
    """Forward request to SiliconFlow API"""
    url = f"{SILICONFLOW_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {SILICONFLOW_API_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        if stream:
            async with client.stream(
                "POST",
                url,
                headers=headers,
                json=request_data,
                timeout=300
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    yield chunk
        else:
            response = await client.post(
                url,
                headers=headers,
                json=request_data,
                timeout=300
            )
            response.raise_for_status()
            yield response.content


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
        "model": converted_data.get("model", "llava:7b"),
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
            # Clean DeepSeek-R1 thinking tokens if present
            cleaned_content = clean_deepseek_r1_response(raw_content)
            openai_response = {
                "id": "chatcmpl-ollama",
                "object": "chat.completion",
                "created": int(datetime.now().timestamp()),
                "model": ollama_request["model"],
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": cleaned_content
                    },
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

    # Check if this is a DeepSeek model, Qwen-VL model, SiliconFlow model, or local Ollama model
    is_deepseek = request.model in DEEPSEEK_MODELS
    is_qwen_vl = request.model in QWEN_VL_MODELS
    is_ollama_local = request.model in OLLAMA_LOCAL_MODELS
    is_siliconflow = request.model in SILICONFLOW_MODELS

    if is_siliconflow:
        # Handle SiliconFlow request
        try:
            if request.stream:
                async def stream_siliconflow():
                    full_response = ""
                    prompt_tokens = 0
                    completion_tokens = 0

                    async for chunk in forward_to_siliconflow(request_data, stream=True):
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

                return StreamingResponse(stream_siliconflow(), media_type="text/event-stream")
            else:
                async for content in forward_to_siliconflow(request_data, stream=False):
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

    elif is_ollama_local:
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

                    return JSONResponse(content=result)
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

    # Handle Ollama request - route to the correct endpoint based on model
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
                        # Clean DeepSeek-R1 thinking tokens if present
                        response_content = clean_deepseek_r1_response(raw_content)
                        # Update the result with cleaned content
                        result['choices'][0]['message']['content'] = response_content
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

                    return JSONResponse(content=result)
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


@app.post("/v1/ocr/recognize")
async def ocr_recognize(
    file: UploadFile = File(...),
    model: str = Form("llava-ocr"),
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

            # Call LLaVA model
            base_url = QWEN_VL_BASE_URL.replace("/v1", "")

            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.post(
                    f"{base_url}/api/chat",
                    json={
                        "model": "llava:7b",
                        "messages": [
                            {
                                "role": "user",
                                "content": ocr_prompt,
                                "images": [base64_image]
                            }
                        ],
                        "stream": False
                    }
                )

                if response.status_code == 200:
                    result = response.json()
                    ocr_text = result.get("message", {}).get("content", "").strip()
                    confidence = 0.85  # LLaVA doesn't provide confidence, use default
                else:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"LLaVA OCR failed: {response.text}"
                    )
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

            # If PDF, try to extract text directly first
            if is_pdf:
                pdf_doc = fitz.open(stream=file_content, filetype="pdf")
                all_texts = []
                needs_ocr = False

                # First pass: try to extract embedded text
                logger.info("Checking PDF for embedded text...")
                for page_num in range(len(pdf_doc)):
                    page = pdf_doc[page_num]
                    page_text = page.get_text("text").strip()
                    if page_text:
                        all_texts.append(f"--- 第 {page_num + 1} 頁 ---\n{page_text}")
                    else:
                        # This page has no text, mark for OCR
                        needs_ocr = True
                        all_texts.append(None)  # Placeholder for OCR result

                # Check if we got meaningful text (at least some non-empty pages)
                extracted_texts = [t for t in all_texts if t is not None]
                total_text_length = sum(len(t) for t in extracted_texts)

                if not needs_ocr and total_text_length > 50:
                    # PDF has embedded text, use it directly
                    logger.info(f"PDF has embedded text ({total_text_length} chars), skipping OCR")
                    pdf_doc.close()
                    ocr_text = "\n\n".join(extracted_texts)
                    confidence = 1.0  # Direct extraction is 100% accurate
                else:
                    # PDF is image-based or has very little text, use OCR
                    logger.info("PDF needs OCR (image-based or insufficient text)")
                    all_texts = []

                    async with httpx.AsyncClient(timeout=180) as client:
                        for page_num in range(len(pdf_doc)):
                            page = pdf_doc[page_num]
                            # Render page to image (300 DPI for better quality)
                            mat = fitz.Matrix(300/72, 300/72)
                            pix = page.get_pixmap(matrix=mat)
                            img_data = pix.tobytes("png")

                            # Send image to DeepSeek OCR
                            files = {"file": (f"page_{page_num + 1}.png", img_data, "image/png")}
                            data = {"prompt": ocr_prompt}

                            response = await client.post(
                                f"{DEEPSEEK_OCR_BASE_URL}/ocr/file",
                                files=files,
                                data=data
                            )

                            if response.status_code == 200:
                                result = response.json()
                                if result.get("success", False):
                                    page_text = result.get("text", "").strip()
                                    if page_text:
                                        all_texts.append(f"--- 第 {page_num + 1} 頁 ---\n{page_text}")
                                else:
                                    all_texts.append(f"--- 第 {page_num + 1} 頁 ---\n[辨識失敗]")
                            else:
                                all_texts.append(f"--- 第 {page_num + 1} 頁 ---\n[辨識失敗: {response.status_code}]")

                    pdf_doc.close()
                    ocr_text = "\n\n".join(all_texts)
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
                            ocr_text = result.get("text", "").strip()
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
            async with httpx.AsyncClient(timeout=300) as client:
                # Forward to external OCR API
                files = {"file": (file.filename, file_content, content_type)}
                data = {"model": model, "language": language}

                response = await client.post(
                    f"{OCR_API_BASE_URL}/ocr/recognize",
                    files=files,
                    data=data
                )

                if response.status_code == 200:
                    result = response.json()
                    ocr_text = result.get("text", "")
                    confidence = result.get("confidence", 0.9)
                else:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"External OCR failed: {response.text}"
                    )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="OCR request timed out")
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
    # Convert http://192.168.31.156:21180/v1 to Endpoint-21180
    import re
    match = re.search(r':(\d{5})', endpoint)
    if match:
        return f"Endpoint-{match.group(1)}"
    return "Endpoint-unknown"


@app.get("/health")
async def health(user: Dict = Depends(get_current_user)):
    """Health check endpoint"""
    global speech_api_health, deepseek_ocr_health

    # Check Speech API health
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{SPEECH_API_BASE_URL}/health", timeout=5)
            speech_api_health = response.status_code == 200
    except Exception:
        speech_api_health = False

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
    # Add SiliconFlow status
    endpoints_status["SiliconFlow"] = "healthy" if siliconflow_health else "unhealthy"
    # Add LLaVA vision model status
    endpoints_status["LLaVA-Local"] = "healthy" if qwen_vl_health else "unhealthy"
    # Add Speech API status
    endpoints_status["Speech-STT-8131"] = "healthy" if speech_api_health else "unhealthy"
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
async def clear_conversations(user: Dict = Depends(get_current_user)):
    """Clear all conversation history from MySQL"""
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
    """Get usage statistics from MySQL"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get summary stats
                await cursor.execute(
                    """SELECT
                       COALESCE(SUM(total_requests), 0) as total_requests,
                       COALESCE(SUM(total_tokens_prompt), 0) as total_tokens_prompt,
                       COALESCE(SUM(total_tokens_completion), 0) as total_tokens_completion,
                       COALESCE(SUM(errors_count), 0) as errors_count,
                       COALESCE(AVG(avg_response_time_ms), 0) as avg_response_time_ms
                       FROM ollama_daily_stats"""
                )
                summary = await cursor.fetchone()

                total_requests = int(summary["total_requests"])
                total_tokens_prompt = int(summary["total_tokens_prompt"])
                total_tokens_completion = int(summary["total_tokens_completion"])
                errors_count = int(summary["errors_count"])
                avg_response_time = float(summary["avg_response_time_ms"])

                # Get model usage
                await cursor.execute(
                    """SELECT model, SUM(request_count) as count
                       FROM ollama_model_stats
                       GROUP BY model
                       ORDER BY count DESC"""
                )
                model_rows = await cursor.fetchall()
                by_model = {row["model"]: int(row["count"]) for row in model_rows}

                # Get daily stats (last 30 days)
                await cursor.execute(
                    """SELECT date, total_requests
                       FROM ollama_daily_stats
                       ORDER BY date DESC
                       LIMIT 30"""
                )
                daily_rows = await cursor.fetchall()
                by_date = {row["date"].strftime("%Y-%m-%d"): int(row["total_requests"])
                           for row in reversed(daily_rows)}

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
                    "by_hour": {},  # Not tracked in DB currently
                    "by_date": by_date
                }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/stats")
async def reset_stats(user: Dict = Depends(get_current_user)):
    """Reset all usage statistics in MySQL"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("DELETE FROM ollama_daily_stats")
                await cursor.execute("DELETE FROM ollama_model_stats")
                return {"message": "Statistics reset successfully"}
    except Exception as e:
        logger.error(f"Failed to reset stats: {e}")
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
async def list_api_keys(admin: Dict = Depends(get_admin_user)):
    """List all API keys (admin only)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    """SELECT id, username, api_key_prefix, is_admin, is_active,
                              created_at, last_used_at, request_count, description
                       FROM api_keys ORDER BY created_at DESC"""
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
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Check if username already exists
                await cursor.execute(
                    "SELECT id FROM api_keys WHERE username = %s",
                    (request.username,)
                )
                if await cursor.fetchone():
                    raise HTTPException(status_code=400, detail=f"Username '{request.username}' already exists")

                # Generate new API key
                api_key = generate_api_key()
                api_key_hash = hash_api_key(api_key)
                api_key_prefix = api_key[:8]

                await cursor.execute(
                    """INSERT INTO api_keys (username, api_key_hash, api_key_prefix, is_admin, description)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (request.username, api_key_hash, api_key_prefix, request.is_admin, request.description)
                )

                # Get the created key ID
                await cursor.execute("SELECT LAST_INSERT_ID() as id")
                result = await cursor.fetchone()

                logger.info(f"API key created for user '{request.username}' by admin '{admin['username']}'")

                return {
                    "message": "API key created successfully",
                    "id": result["id"],
                    "username": request.username,
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


@app.get("/api/me")
async def get_current_user_info(user: Dict = Depends(get_current_user)):
    """Get current user's info"""
    return {
        "id": user["id"],
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
        "request_count": user["request_count"]
    }


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


# SiliconFlow Configuration Endpoints
class UpdateSiliconFlowKeyRequest(BaseModel):
    api_key: str


@app.get("/api/siliconflow/config")
async def get_siliconflow_config(admin: Dict = Depends(get_admin_user)):
    """Get SiliconFlow API configuration (admin only)"""
    global SILICONFLOW_API_KEY

    # Check if API key is configured (don't show any part of the key)
    key_status = "已設定" if SILICONFLOW_API_KEY and len(SILICONFLOW_API_KEY) > 0 else "未設定"

    return {
        "api_key_status": key_status,
        "base_url": SILICONFLOW_BASE_URL,
        "models": SILICONFLOW_MODELS
    }


@app.put("/api/siliconflow/config")
async def update_siliconflow_config(request: UpdateSiliconFlowKeyRequest, admin: Dict = Depends(get_admin_user)):
    """Update SiliconFlow API Key (admin only)"""
    global SILICONFLOW_API_KEY

    new_key = request.api_key.strip()

    if not new_key:
        raise HTTPException(status_code=400, detail="API Key 不能為空")

    if not new_key.startswith("sk-"):
        raise HTTPException(status_code=400, detail="無效的 SiliconFlow API Key 格式（應以 sk- 開頭）")

    # Verify the new key by making a simple API call
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SILICONFLOW_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {new_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "Qwen/Qwen2.5-7B-Instruct",
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 5
                },
                timeout=30
            )

            if response.status_code == 401:
                raise HTTPException(status_code=400, detail="API Key 驗證失敗，請確認 Key 是否正確")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"無法連接到 SiliconFlow API: {str(e)}")

    # Update the global variable
    old_key_masked = SILICONFLOW_API_KEY[:8] + "..." if SILICONFLOW_API_KEY else "無"
    SILICONFLOW_API_KEY = new_key

    logger.info(f"SiliconFlow API Key updated by admin '{admin['username']}'")

    return {
        "message": "SiliconFlow API Key 更新成功",
        "api_key_status": "已設定"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8777)