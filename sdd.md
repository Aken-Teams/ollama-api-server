# PJ_API 管理系統 - 系統設計文件 (SDD)

**版本**: 1.0.0  
**日期**: 2026-04-04  
**設計單位**: 智合科技  

---

## 1. 系統架構

### 1.1 架構總覽

```
                        ┌──────────────────────────────┐
                        │     Web 瀏覽器 (前端 UI)       │
                        └──────────────┬───────────────┘
                                       │ HTTP/HTTPS
                        ┌──────────────▼───────────────┐
                        │   PJ_API Gateway (Port 8777)  │
                        │   FastAPI + Uvicorn            │
                        └──┬─────┬──────┬─────┬────────┘
                           │     │      │     │
              ┌────────────▼┐  ┌─▼────┐ │   ┌─▼──────────┐
              │ llama.cpp    │  │Ollama│ │   │   MySQL     │
              │ :21180-21185 │  │:11434│ │   │  :43306     │
              └──────────────┘  └──────┘ │   └────────────┘
                                         │
                    ┌────────────────────┬┴──────────────────┐
                ┌───▼────┐    ┌─────────▼──┐    ┌───────────▼──┐
                │DeepSeek│    │ SiliconFlow │    │ 內部服務       │
                │  API   │    │    API      │    │ STT / OCR    │
                └────────┘    └────────────┘    └──────────────┘
```

### 1.2 部署模式

**本地執行**（預設）：所有內部服務指向 `localhost`

```bash
DEEPSEEK_API_KEY=sk-xxx uvicorn ollama_api_server:app --host 0.0.0.0 --port 8777
```

**Docker 部署**：透過環境變數切換為 Docker 網路

```yaml
environment:
  - LLAMA_HOST=host.docker.internal
  - OLLAMA_HOST=host.docker.internal
  - OCR_HOST=pp-ocr-service
```

---

## 2. 後端設計

### 2.1 技術棧

| 元件 | 技術 | 版本 |
|------|------|------|
| 框架 | FastAPI | latest |
| ASGI | Uvicorn | latest |
| HTTP Client | httpx | async |
| 資料庫 | MySQL | 8.4 |
| DB Driver | aiomysql | async pool |
| PDF 處理 | PyMuPDF (fitz) | latest |
| 圖片處理 | Pillow | latest |
| 認證 | HTTPBearer | FastAPI built-in |

### 2.2 模組架構

```
ollama_api_server.py（單檔應用，約 3500 行）
├── Configuration         # 環境變數、模型配置、端點定義
├── Database              # MySQL 連線池、表初始化、遷移
├── Authentication        # API Key 驗證、使用者認證、角色授權
├── Model Routing         # 根據 model 名稱路由至對應後端
├── Request Forwarding    # 轉發請求至 llama.cpp / Ollama / DeepSeek / SiliconFlow
├── Response Processing   # DeepSeek-R1 清洗、Ollama→OpenAI 格式轉換
├── Conversation Logging  # 非同步寫入對話記錄與統計
├── API Endpoints         # 36 個 REST API 端點
└── Health Monitoring     # 30 秒循環健康檢查
```

### 2.3 請求路由流程

```
POST /v1/chat/completions
    │
    ├─ model ∈ SILICONFLOW_MODELS? → forward_to_siliconflow()
    ├─ model ∈ OLLAMA_LOCAL_MODELS? → forward_to_ollama_local()
    ├─ model ∈ QWEN_VL_MODELS?     → forward_to_qwen_vl()
    ├─ model ∈ DEEPSEEK_MODELS?    → forward_to_deepseek()
    └─ else (llama.cpp models)     → forward_request(get_available_endpoint(model))
```

**路由優先序**：SiliconFlow → Ollama Local → Qwen-VL → DeepSeek → llama.cpp

### 2.4 Streaming 架構

```python
async def stream_with_recording():
    full_response = ""
    async for chunk in forward_to_xxx(request_data, stream=True):
        yield chunk                    # 即時回傳給客戶端
        full_response += parse(chunk)  # 同步收集完整回應
    record_conversation(...)           # 串流結束後寫入 DB
```

- 使用 `StreamingResponse` + `text/event-stream`
- SSE 格式：`data: {json}\n\n`
- 串流結束訊號：`data: [DONE]\n\n`

### 2.5 Ollama 格式轉換

視覺模型需將 OpenAI 格式轉為 Ollama 原生格式：

```
OpenAI 格式:
  messages[].content = [{type: "text", text: "..."}, {type: "image_url", image_url: {url: "data:image/png;base64,..."}}]

Ollama 格式:
  messages[].content = "..."
  messages[].images = ["base64_data"]
```

---

## 3. 資料庫設計

### 3.1 連線配置

```python
MYSQL_CONFIG = {
    "host": "122.100.99.161",
    "port": 43306,
    "db": "db_A999",
    "charset": "utf8mb4",
    "autocommit": True,
    "pool_minsize": 1,
    "pool_maxsize": 10,
}
```

### 3.2 ER 圖

```
┌──────────────────┐       ┌──────────────────┐
│  system_users    │       │    api_keys       │
├──────────────────┤       ├──────────────────┤
│ id          PK   │       │ id          PK   │
│ username  UQ     │──────>│ username  UQ     │
│ password         │       │ api_key_hash     │
│ is_admin         │       │ api_key_prefix   │
│ is_active        │       │ is_admin         │
│ created_at       │       │ is_active        │
└──────────────────┘       │ created_at       │
                           │ last_used_at     │
                           │ request_count    │
                           │ description      │
                           └──────────────────┘

┌───────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│ ollama_conversations  │   │ ollama_daily_stats  │   │ ollama_model_stats │
├───────────────────────┤   ├────────────────────┤   ├────────────────────┤
│ id             PK     │   │ id          PK     │   │ id          PK     │
│ timestamp             │   │ date        UQ     │   │ date               │
│ model                 │   │ total_requests     │   │ model              │
│ messages       JSON   │   │ total_tokens_prompt│   │ request_count      │
│ response       TEXT   │   │ total_tokens_comp  │   └────────────────────┘
│ prompt_tokens         │   │ errors_count       │
│ completion_tokens     │   │ avg_response_time  │
│ total_tokens          │   └────────────────────┘
│ response_time_ms      │
│ success               │
│ user_id          FK?  │
│ username              │
└───────────────────────┘
```

### 3.3 統計寫入策略

使用 `INSERT ... ON DUPLICATE KEY UPDATE` 實現 Upsert：

```sql
-- 每日統計（自動累加）
INSERT INTO ollama_daily_stats (date, total_requests, ...)
VALUES (%s, 1, ...)
ON DUPLICATE KEY UPDATE
  total_requests = total_requests + 1,
  avg_response_time_ms = (avg_response_time_ms * (total_requests - 1) + %s) / total_requests

-- 模型統計
INSERT INTO ollama_model_stats (date, model, request_count)
VALUES (%s, %s, 1)
ON DUPLICATE KEY UPDATE request_count = request_count + 1
```

### 3.4 非同步寫入

```python
def record_conversation(...):
    asyncio.create_task(record_conversation_to_db(...))  # Fire-and-forget
```

不阻塞 API 回應，寫入失敗僅記錄 log。

---

## 4. 認證與授權

### 4.1 認證流程

```
1. POST /api/login { username, password }
         │
         ▼
2. 查詢 system_users 表驗證
         │
         ▼
3. 產生 API Key (secrets.token_urlsafe(32))
         │
         ├─ 若已有 key → UPDATE api_keys SET hash=新hash, is_admin=同步
         └─ 若無 key   → INSERT INTO api_keys
         │
         ▼
4. 回傳 { api_key, user: { id, username, is_admin } }
```

### 4.2 API Key 驗證

```
Request Header: Authorization: Bearer <api_key>
         │
         ▼
1. 檢查 Master API Key（硬編碼，DB 不可用時的備援）
         │ 不匹配
         ▼
2. SHA256(api_key) → 查詢 api_keys 表
         │ 匹配且 is_active=true
         ▼
3. 更新 last_used_at, request_count += 1
         │
         ▼
4. 回傳 user dict { id, username, is_admin, ... }
```

### 4.3 權限分級

| 層級 | Dependency | 可存取 |
|------|-----------|--------|
| 公開 | 無 | `GET /`, `POST /api/login` |
| 一般使用者 | `get_current_user` | 模型、對話、統計查詢 |
| 管理員 | `get_admin_user` | Key 管理、使用者管理、資料刪除、系統設定 |

---

## 5. 外部服務整合

### 5.1 服務端點總覽

| 服務 | 預設地址 | 環境變數 | 用途 |
|------|---------|----------|------|
| llama.cpp #1 | localhost:21180 | LLAMA_HOST | gpt-oss:120b |
| llama.cpp #2 | localhost:21181 | LLAMA_HOST | gemma4:31b |
| llama.cpp #3 | localhost:21182 | LLAMA_HOST | Qwen3-Embedding-8B |
| llama.cpp #4 | localhost:21183 | LLAMA_HOST | bge-reranker-v2-m3 |
| llama.cpp #5 | localhost:21185 | LLAMA_HOST | Qwen3.5:122b |
| Ollama | localhost:11434 | OLLAMA_HOST | llava:7b, qwen2.5:72b |
| DeepSeek | api.deepseek.com | - | deepseek-chat, deepseek-reasoner |
| SiliconFlow | api.siliconflow.cn | - | 50+ 雲端模型 |
| STT | localhost:8131 | SPEECH_API_BASE_URL | 語音轉文字 |
| PP-OCR | localhost:8132 | OCR_API_BASE_URL | PaddleOCR v5 |
| DeepSeek OCR | 192.168.0.191:8001 | DEEPSEEK_OCR_BASE_URL | GPU OCR |

### 5.2 健康檢查

```python
async def health_check_loop():
    while True:
        await asyncio.sleep(30)
        for endpoint in OLLAMA_ENDPOINTS:
            GET {endpoint}/models → 更新 endpoint_health[endpoint]
```

每 30 秒循環檢查所有 llama.cpp 端點。DeepSeek / SiliconFlow / STT / OCR 在 `GET /health` 時即時檢查。

### 5.3 故障轉移

```python
# llama.cpp 端點故障轉移（最多 3 次）
for attempt in range(3):
    try:
        endpoint = get_available_endpoint(model)
        return await forward_request(endpoint, ...)
    except:
        endpoint_health[endpoint] = False
        continue  # 嘗試下一個端點
```

- 若模型有專屬端點（MODEL_ENDPOINT_MAP），優先使用
- 若專屬端點不可用，仍嘗試（讓錯誤透過）
- 未知模型隨機選擇健康端點

### 5.4 超時配置

```python
timeout_config = httpx.Timeout(
    connect=10.0,    # 連線建立
    read=300.0,      # 等待回應（5 分鐘，大模型需要）
    write=30.0,      # 發送請求
    pool=10.0        # 連線池取得
)
```

---

## 6. OCR 處理流程

### 6.1 檔案處理

```
上傳檔案
    │
    ├─ 圖片 (JPG/PNG/GIF/WebP/BMP)
    │   ├─ RGBA → RGB 轉換（白底）
    │   └─ base64 編碼
    │
    └─ PDF
        ├─ 嘗試 PyMuPDF 文字提取
        │   └─ 有文字 → 直接回傳
        └─ 無文字（掃描件）
            └─ 逐頁渲染為圖片（300 DPI）
                └─ 送 OCR 模型辨識
```

### 6.2 模型路由

```
model = "llava-ocr"    → Ollama /api/chat (prompt: 辨識圖片文字)
model = "pp-ocrv5"     → PP-OCR /ocr/recognize (multipart file)
model = "deepseek-ocr" → DeepSeek OCR /ocr/file (multipart file + prompt)
model = "general-ocr"  → PP-OCR /ocr/recognize
model = "table-ocr"    → PP-OCR /ocr/recognize
model = "invoice-ocr"  → PP-OCR /ocr/recognize
```

---

## 7. 前端設計

### 7.1 架構

```
static/
├── index.html          # 主頁面（單頁應用）
├── css/                # 13 個 CSS 模組
│   ├── base.css        # 全域樣式、排版
│   ├── login.css       # 登入頁
│   ├── orbital.css     # 登入動畫
│   ├── status.css      # 服務狀態卡片
│   ├── stats.css       # 統計圖表
│   ├── test.css        # 測試介面
│   ├── speech.css      # 語音控制
│   ├── ocr.css         # OCR 上傳/結果
│   ├── keys.css        # Key 管理表格
│   ├── components.css  # 共用元件
│   ├── history.css     # 對話歷史
│   ├── docs.css        # 文檔頁面
│   └── footer.css      # 頁尾
└── js/                 # 15 個 JS 模組
    ├── app.js          # 全域狀態初始化
    ├── auth.js         # 認證、角色控制
    ├── tabs.js         # 分頁切換、子分頁
    ├── status.js       # 健康監控
    ├── stats.js        # 統計圖表
    ├── testing.js      # API 測試工具
    ├── speech.js       # 語音錄製/上傳
    ├── ocr.js          # OCR 辨識
    ├── keys.js         # API Key CRUD
    ├── config.js       # 系統設定
    ├── models.js       # 模型列表
    ├── vision.js       # 視覺模型圖片
    ├── history.js      # 對話歷史
    ├── utils.js        # 工具函式
    └── orbital.js      # 登入背景動畫
```

### 7.2 頁面結構

```
┌─────────────────────────────────────────┐
│ Header: PJ_API 管理系統  [使用者] [登出] │
├─────────────────────────────────────────┤
│ [總覽] [AI 工具] [管理*] [系統設定*] [文檔] │
├─────────────────────────────────────────┤
│                                         │
│  總覽:                                   │
│    ┌─ 服務狀態監控 ──────────────────┐    │
│    │  [狀態摘要] [服務卡片網格]       │    │
│    └────────────────────────────────┘    │
│    ┌─ 使用統計 ─────────────────────┐    │
│    │  [統計卡片] [模型分布] [趨勢圖]  │    │
│    └────────────────────────────────┘    │
│                                         │
│  AI 工具:                                │
│    [API 測試] [語音轉文字] [OCR 辨識]     │
│    ┌─ 子分頁內容 ───────────────────┐    │
│    │  (根據子分頁切換顯示)            │    │
│    └────────────────────────────────┘    │
│                                         │
│  * 管理員才可見                           │
│                                         │
├─────────────────────────────────────────┤
│ Footer: v1.0.0 | 設計單位：智合科技       │
└─────────────────────────────────────────┘
```

### 7.3 狀態管理

全域變數（app.js）：

```javascript
// 認證
let isAuthenticated = localStorage.getItem('pj_authenticated') === 'true';
let currentApiKey   = localStorage.getItem('pj_api_key') || '';
let currentUser     = null;
let currentRole     = null;

// 服務健康
let endpoint_health = {};  // { url: boolean }
let deepseek_health, siliconflow_health, qwen_vl_health;
let speech_api_health, ocr_api_health, deepseek_ocr_health;

// 自動刷新
let autoRefreshEnabled = true;
let autoRefreshInterval = null;  // 30s interval
```

### 7.4 API 呼叫封裝

```javascript
async function authFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${currentApiKey}`
        }
    });
}
```

---

## 8. Docker 部署

### 8.1 Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV LLAMA_HOST=host.docker.internal
ENV OLLAMA_HOST=host.docker.internal
ENV OCR_HOST=pp-ocr-service
ENV ENV_FILE_PATH=/app/.env

EXPOSE 8777
CMD ["uvicorn", "ollama_api_server:app", "--host", "0.0.0.0", "--port", "8777",
     "--timeout-keep-alive", "120", "--log-level", "info"]
```

### 8.2 Docker Compose

```yaml
services:
  ollama-api-gateway:
    build: .
    ports: ["8777:8777"]
    env_file: .env
    depends_on:
      pp-ocr-service:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8777/"]
      interval: 30s

  pp-ocr-service:
    build: ./pp_ocr_service
    ports: ["8132:8132"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8132/health"]
      interval: 30s
```

### 8.3 網路拓撲

```
Docker Network
├── ollama-api-gateway (8777)
│   ├──→ host.docker.internal:21180-21185 (llama.cpp)
│   ├──→ host.docker.internal:11434 (Ollama)
│   ├──→ host.docker.internal:8131 (STT)
│   ├──→ pp-ocr-service:8132 (OCR, Docker 內部)
│   ├──→ api.deepseek.com (雲端)
│   └──→ api.siliconflow.cn (雲端)
└── pp-ocr-service (8132)
    └── PaddleOCR v5 engine
```

---

## 9. 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | (從 .env 讀取) | DeepSeek API 金鑰 |
| `SILICONFLOW_API_KEY` | (硬編碼預設) | SiliconFlow API 金鑰 |
| `MASTER_API_KEY` | pj-admin-zhpjaiaoi-2024 | 備援管理員金鑰 |
| `LLAMA_HOST` | localhost | llama.cpp 伺服器地址 |
| `OLLAMA_HOST` | localhost | Ollama 伺服器地址 |
| `OCR_HOST` | localhost | PP-OCR 服務地址 |
| `QWEN_VL_BASE_URL` | http://localhost:11434/v1 | 視覺模型端點 |
| `OLLAMA_LOCAL_BASE_URL` | http://localhost:11434/v1 | Ollama 文字模型端點 |
| `SPEECH_API_BASE_URL` | http://localhost:8131 | 語音轉文字服務端點 |
| `OCR_API_BASE_URL` | http://localhost:8132 | PP-OCR 服務端點 |
| `DEEPSEEK_OCR_BASE_URL` | http://192.168.0.191:8001 | DeepSeek OCR 端點 |
| `ENV_FILE_PATH` | (專案目錄/.env) | .env 檔案路徑 |

---

## 10. 依賴清單

### 10.1 Python 套件

```
fastapi
uvicorn[standard]
httpx
pydantic
requests
aiomysql
pymysql
python-multipart
PyMuPDF
Pillow
```

### 10.2 外部服務依賴

| 服務 | 必要性 | 影響 |
|------|--------|------|
| MySQL | 建議 | 無 DB 時僅 Master Key 可用，無統計/歷史 |
| llama.cpp | 選用 | 地端模型不可用 |
| Ollama | 選用 | 視覺/本地文字模型不可用 |
| DeepSeek API | 選用 | DeepSeek 模型不可用 |
| SiliconFlow API | 選用 | 50+ 雲端模型不可用 |
| STT Service | 選用 | 語音轉文字不可用 |
| PP-OCR | 選用 | PP-OCR/通用/表格/發票 OCR 不可用 |
| DeepSeek OCR | 選用 | GPU OCR 不可用 |

---

## 11. 安全設計

### 11.1 認證安全

- API Key 以 `secrets.token_urlsafe(32)` 產生（256 bit 隨機）
- 儲存使用 `SHA256` 雜湊，資料庫不保存明文
- 僅在建立/重新產生時回傳一次明文
- 前端以 `localStorage` 儲存（Session 級別）

### 11.2 端點保護

- 所有 API 端點（除 `GET /` 和 `POST /api/login`）需要 Bearer Token
- 破壞性操作（DELETE）限管理員角色
- 系統帳號（SYSTEM_USERNAMES）從列表中隱藏
- API Key 建立需驗證使用者名稱格式與描述

### 11.3 請求轉發安全

- 轉發時使用乾淨 Header（不傳遞客戶端的 Host/Content-Length）
- 端點 IP 在 `/health` 回應中遮罩（僅顯示 port）

### 11.4 已知限制

- CORS 設定為 `allow_origins=["*"]`（適用於內網部署）
- MySQL 帳密寫在程式碼中（建議改用環境變數）
- SiliconFlow 預設 Key 硬編碼（建議改用環境變數）
- 密碼在 system_users 表中為明文儲存（建議改用雜湊）
