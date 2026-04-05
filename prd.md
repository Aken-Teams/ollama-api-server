# PJ_API 管理系統 - 產品需求文件 (PRD)

**版本**: 1.0.0  
**日期**: 2026-04-04  
**設計單位**: 智合科技  

---

## 1. 產品概述

### 1.1 產品定義

PJ_API 管理系統是一套統一的 AI 模型 API 閘道服務，將地端部署的 llama.cpp / Ollama 模型與雲端 AI 服務（DeepSeek、SiliconFlow）整合為單一 OpenAI 相容的 API 介面，並提供 Web 管理後台進行監控、測試與權限管理。

### 1.2 目標使用者

| 角色 | 說明 |
|------|------|
| 系統管理員 | 管理 API Key、使用者帳號、雲端服務金鑰配置 |
| 內部開發者 | 透過 API Key 串接 AI 模型至企業內部系統（MES、知識庫、問卷等） |
| 一般使用者 | 透過 Web 介面使用 AI 對話、語音轉文字、OCR 辨識等功能 |

### 1.3 核心價值

- **統一入口**: 一個 API endpoint 存取 50+ AI 模型（地端 + 雲端）
- **OpenAI 相容**: 直接替換 OpenAI API URL 即可使用，零改造成本
- **多功能整合**: 文字對話、視覺理解、語音轉文字、OCR 文件辨識
- **使用追蹤**: 自動記錄每筆請求的 Token 用量、回應時間、成功率

---

## 2. 功能需求

### 2.1 AI 模型服務

#### 2.1.1 Chat Completions（核心功能）

- 支援 OpenAI `/v1/chat/completions` 格式
- Stream / Non-stream 雙模式
- 根據 model 名稱自動路由至對應後端：

| 類型 | 模型 | 來源 |
|------|------|------|
| 地端 | gpt-oss:120b, gemma4:31b, Qwen3.5:122b | llama.cpp server |
| 地端 | qwen2.5:72b, llava:7b | Ollama |
| 雲端 | deepseek-chat, deepseek-reasoner | DeepSeek API |
| 雲端 | 50+ 模型（Qwen3、GLM-4、Kimi-K2 等） | SiliconFlow API |

- 視覺模型支援 base64 圖片輸入（OpenAI 格式自動轉換為 Ollama 格式）
- DeepSeek-R1 思考過程自動清洗（移除 `<think>` 標籤）
- 每筆請求自動記錄至資料庫（模型、Token、回應時間、成功/失敗）

#### 2.1.2 Embeddings

- 支援 `/v1/embeddings` 端點
- 路由至對應的 embedding 模型（Qwen3-Embedding-8B）

#### 2.1.3 模型列表

- `GET /v1/models` 回傳所有可用模型
- 附帶模型資訊：名稱、類型（地端/雲端）、提供者、功能描述、context 長度
- 隱藏 embedding/reranker 等非對話模型

### 2.2 語音轉文字

| 功能 | 說明 |
|------|------|
| 檔案上傳轉錄 | 支援 WAV, MP3, M4A, OGG, FLAC, WebM |
| Base64 轉錄 | 接受 base64 編碼的音訊資料 |
| 即時翻譯 | 轉錄後透過 LLM 翻譯為 13 種語言 |
| 一步完成 | 語音轉文字 + 翻譯合併為單一 API 呼叫 |

支援語言：繁中、簡中、英文、日文、韓文、法文、德文、西班牙文、葡萄牙文、俄文、阿拉伯文、泰文、越南文

### 2.3 OCR 文件辨識

| 模型 | 類型 | 特色 |
|------|------|------|
| LLaVA OCR | 地端 AI | 上下文理解、手寫辨識 |
| PP-OCRv5 | 外部服務 | 超高精度、80+ 語言、表格辨識 |
| 通用 OCR | 外部服務 | 高精度、快速處理 |
| 表格 OCR | 外部服務 | 表格結構保留、欄位對齊 |
| 發票 OCR | 外部服務 | 發票格式、金額辨識 |
| DeepSeek OCR | GPU 加速 | 高精度、多語言、智能版面分析 |

- 支援圖片格式：JPG, PNG, GIF, WebP, BMP
- 支援 PDF 檔案（自動轉圖片，300 DPI）
- 檔案大小上限：20MB
- 輸出格式：純文字、JSON、Markdown、全部

### 2.4 服務監控

- 即時顯示所有後端服務健康狀態（11 個端點）
- 30 秒自動刷新
- 在線/離線/可用模型數統計

### 2.5 使用統計

- 總請求數、成功率、平均回應時間、Token 用量
- 模型使用分布圖
- 每日請求趨勢圖（近 30 天）
- Prompt / Completion Token 明細

### 2.6 API 測試工具

- 模型快速測試（一鍵測試所有模型）
- Chat Completions 互動測試（支援 System Prompt、圖片上傳、Stream 模式）
- 回應內容複製、原始 JSON 檢視

---

## 3. 管理功能

### 3.1 使用者認證

- 帳號密碼登入（MySQL system_users 表）
- 登入後自動產生獨立 API Key（SHA256 雜湊儲存）
- 支援管理員 / 一般使用者兩種角色
- 預設管理員帳號：aken

### 3.2 API Key 管理（管理員）

- 建立 API Key（指定使用者名稱、用途描述、管理員權限）
- 使用者名稱驗證（至少 2 字元、格式限制、禁用系統保留名稱）
- 用途描述為必填欄位
- 停用 / 啟用 / 重新產生 / 刪除 Key
- 自動過濾系統帳號與測試帳號
- 依使用次數排序顯示

### 3.3 使用者管理（管理員）

- 新增 / 編輯 / 刪除系統登入帳號
- 管理員權限切換
- 帳號啟用 / 停用

### 3.4 系統設定（管理員）

- DeepSeek API Key 更新（含餘額查詢與驗證）
- SiliconFlow API Key 更新（含連線驗證）

---

## 4. 非功能需求

### 4.1 效能

| 指標 | 需求 |
|------|------|
| 連線超時 | 10 秒 |
| 讀取超時 | 300 秒（大型模型需較長時間） |
| Keep-alive | 120 秒 |
| DB 連線池 | 1-10 連線 |
| 健康檢查間隔 | 30 秒 |

### 4.2 可靠性

- 端點自動故障轉移（最多重試 3 次）
- 資料庫不可用時仍可透過 Master API Key 使用
- 非同步寫入資料庫（不阻塞 API 回應）

### 4.3 安全性

- API Key 以 SHA256 雜湊儲存，不保存明文
- 所有 API 端點需要認證（Bearer Token）
- 破壞性操作（清空資料）限管理員
- 系統帳號從管理介面中隱藏
- CORS 開放（內部網路部署）

### 4.4 部署

- 支援 Docker 容器部署（含 docker-compose）
- 支援本地直接執行（`uvicorn` 啟動，預設 localhost）
- 環境變數控制所有外部服務地址

---

## 5. Web 管理介面

### 5.1 頁面結構

| 分頁 | 可見性 | 內容 |
|------|--------|------|
| 總覽 | 所有人 | 服務狀態監控 + 使用統計 |
| AI 工具 | 所有人 | API 測試 / 語音轉文字 / OCR 辨識（子分頁） |
| 管理 | 管理員 | API Key 管理 + 使用者管理 |
| 系統設定 | 管理員 | 雲端 API 金鑰配置 |
| 文檔 | 所有人 | API 使用文檔與範例程式碼 |

### 5.2 技術規格

- 純前端：HTML + CSS + Vanilla JavaScript（無框架依賴）
- 模組化 JS 架構（15 個獨立 JS 模組）
- 模組化 CSS 架構（13 個獨立 CSS 檔案）
- 響應式設計
- 即時資料更新（30 秒自動刷新）

---

## 6. API 端點總覽

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/` | 無 | Web 介面 |
| GET | `/health` | API Key | 健康檢查 |
| GET | `/v1/models` | API Key | 模型列表 |
| POST | `/v1/chat/completions` | API Key | AI 對話 |
| POST | `/v1/completions` | API Key | 文字補全 |
| POST | `/v1/embeddings` | API Key | 向量嵌入 |
| POST | `/v1/vision/analyze` | API Key | 視覺分析 |
| POST | `/v1/audio/transcriptions` | API Key | 語音轉文字 |
| POST | `/v1/audio/transcriptions/base64` | API Key | 語音轉文字（Base64） |
| POST | `/v1/audio/translate` | API Key | 文字翻譯 |
| POST | `/v1/audio/transcribe-and-translate` | API Key | 語音轉文字+翻譯 |
| GET | `/v1/ocr/models` | API Key | OCR 模型列表 |
| GET | `/v1/ocr/health` | API Key | OCR 健康檢查 |
| POST | `/v1/ocr/recognize` | API Key | OCR 辨識 |
| POST | `/api/login` | 無 | 使用者登入 |
| GET | `/api/me` | API Key | 當前使用者資訊 |
| GET | `/api/conversations` | API Key | 對話歷史 |
| GET | `/api/conversations/{id}` | API Key | 對話詳情 |
| DELETE | `/api/conversations` | 管理員 | 清空對話 |
| GET | `/api/stats` | API Key | 使用統計 |
| DELETE | `/api/stats` | 管理員 | 重置統計 |
| GET | `/api/keys` | 管理員 | API Key 列表 |
| POST | `/api/keys` | 管理員 | 建立 API Key |
| GET | `/api/keys/{id}` | 管理員 | API Key 詳情 |
| PUT | `/api/keys/{id}` | 管理員 | 更新 API Key |
| DELETE | `/api/keys/{id}` | 管理員 | 刪除 API Key |
| POST | `/api/keys/{id}/regenerate` | 管理員 | 重新產生 Key |
| GET | `/api/system-users` | 管理員 | 使用者列表 |
| POST | `/api/system-users` | 管理員 | 新增使用者 |
| PUT | `/api/system-users/{id}` | 管理員 | 更新使用者 |
| DELETE | `/api/system-users/{id}` | 管理員 | 刪除使用者 |
| GET | `/api/deepseek/config` | 管理員 | DeepSeek 配置 |
| PUT | `/api/deepseek/config` | 管理員 | 更新 DeepSeek Key |
| GET | `/api/deepseek/balance` | 管理員 | DeepSeek 餘額 |
| GET | `/api/siliconflow/config` | 管理員 | SiliconFlow 配置 |
| PUT | `/api/siliconflow/config` | 管理員 | 更新 SiliconFlow Key |
