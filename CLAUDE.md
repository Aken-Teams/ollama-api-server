# PJ_API Gateway — quick reference for Claude

> 此檔在每個 session 自動載入，請保持精簡（只放跨 session 一定要知道的事）。
> 詳細 PRD/設計請看 `prd.md` / `sdd.md`。

## 專案是什麼
- FastAPI gateway（`ollama_api_server.py`）統一管理多個 LLM backend：
  - llama.cpp servers（gpt-oss:120b 21180、gemma4:31b 21181、Qwen3-Embedding-8B 21182、bge-reranker 21183）
  - Ollama（11434 — 含 gemma3:27b、gemma4:latest、nemotron3:33b、**qwen3.6:35b-a3b-mlx-bf16**）
  - MLX server（21191 — `mlx-community/Qwen2.5-1.5B-Instruct-4bit`）
  - DeepSeek 雲端（v4-flash / v4-pro）
- 對外提供 OpenAI 相容 API（`/v1/models`、`/v1/chat/completions`、`/v1/embeddings`、`/v1/audio/*`）+ 簡易 OCR + 管理 UI
- 部署：localhost:8777 → Cloudflare Tunnel → `ollama_pjapi.theaken.com`

## 服務狀態
- 全部 services 走 launchd（`~/Library/LaunchAgents/com.zhaoi.*.plist`）
- 確認狀態：`launchctl list | grep -E "ollama-api|llama-server|mlx-qwen"`
- ollama 版本：0.23.1（Homebrew，nemotron3 需 ≥ 0.22）

## 前端架構（重要）
- **無 build / 無框架**，純 vanilla JS + 原生 HTML
- 入口：`static/index.html`（FastAPI 服務根路徑會優先回 `static/index.html`）
- ~17 個 JS 模組依序 `<script src="...">` 載入，**第一個是 `store.js`**
- 注意：`static/js/all.js` 是 legacy 巨型檔，**沒被載入**，看到不要被誤導
- HTTP cache：`/` 與 `/static/*` 強制 `Cache-Control: no-cache, no-store, must-revalidate`（gateway middleware），所以**改前端 JS 不需 hard refresh，瀏覽器會自動拉新版**

## 中央 Store（store.js）
專案採共用 state 中央化但**無框架反應式**的設計：

```js
// 讀
const key  = AppStore.get('apiKey');
const auth = AppStore.get('isAuthenticated');

// 寫（會通知所有訂閱者）
AppStore.set('apiKey', 'sk-xxx');

// 訂閱
const unsub = AppStore.subscribe('apiKey', (cur, prev) => { ... });

// debug（console）
__store();   // console.table 印當前 state
```

### 已遷移的檔（寫入點透過 AppStore.set）
- `app.js`（state 宣告 + `let` 別名 + subscribers 雙向同步）
- `auth.js`（登入 / 登出 / restore session）
- `models.js`（/v1/models 載入）
- `vision.js`（圖片上傳 / 移除 x4）
- `testing.js`（quickTestModels / lastRawResponse / lastAIContent）
- `speech.js`（讀取已用 AppStore.get）

### 未遷移檔（不影響運作）
- `keys.js / status.js / history.js / stats.js / ocr.js / permissions.js / usage.js / config.js / tabs.js / utils.js / orbital.js`
- 這些檔多半只**讀取** globals，靠 `app.js` 的 `let` mirror 仍能拿到最新值
- 新功能寫入 state 時，**請走 `AppStore.set(...)`**

### Store 提供的 key
| key | 型 | 來源 |
|---|---|---|
| `apiKey` | string | 登入後存 |
| `isAuthenticated` | bool | |
| `user` / `role` | object / string | |
| `models` | array | /v1/models 結果 |
| `quickTestModels` | array | testing tab 用 |
| `uploadedImage` | data URL string | chat 測試圖片 |
| `visionImage` | data URL string | vision tab 圖片 |
| `lastVisionResult` | string | |
| `lastRawResponse` / `lastAIContent` | any / string | testing tab 串流結果 |
| `apiUrl` / `externalUrl` | string | 常數 |

## Gateway 重要設定（`ollama_api_server.py`）
- `MASTER_API_KEY = 'pj-admin-zhpjaiaoi-2024'`（admin 預設 key）
- `MODEL_ENDPOINT_MAP` 直接路由到指定 backend port（不走自動發現）
- `OLLAMA_LOCAL_MODELS / DEEPSEEK_MODELS / QWEN_VL_MODELS` 是路由白名單，不在白名單的 chat/completions 會 400
- `MODEL_INFO`：給每個模型加 name/description/features/best_for/context_length，前端 UI 自動 render
- `HIDDEN_MODELS`：在 /v1/models 列表隱藏（embedding/reranker 之類）

## 加新模型的 SOP
1. **本地推理**：寫 `start_xxx.sh` + LaunchAgent plist + load
2. **路由**：`MODEL_ENDPOINT_MAP[id] = http://localhost:PORT/v1` 或加進對應的 LIST 白名單
3. **資訊**：`MODEL_INFO[id] = { name, type, provider, description, features, best_for, context_length }`
4. reload gateway：`launchctl kickstart -k gui/$(id -u)/com.zhaoi.ollama-api-gateway`

## 每模型一把 API key（2026-05-12 起）
- 已**取消**舊的 agent 路由（`model="auto"` / `"agent"` 改回 400）
- 12 個 chat 模型各有專屬 API key（DB username 為 `model-<slug>`），每把 key `allowed_models` 鎖死該模型，`allowed_features=["chat"]`
- 一次性產生腳本：`python3 create_per_model_keys.py`（idempotent；`--rotate` 會換新 hash），明文 key 寫到 `per_model_keys.txt`

## 常見坑
- llama-server `/v1/models` 回 `{models, data}` 兩種 key — gateway 用 `data`（OpenAI 標準）
- mlx_lm.server 會 enumerate HF cache 裡的所有模型，`/v1/models` aggregation 不能直接信，所以 gateway 對 MLX 用 MODEL_ENDPOINT_MAP 顯式註冊
- gemma3 / gemma4 / gpt-oss / nemotron3 / deepseek-v4 都是 reasoning 模型 → 回應分 `content` + `reasoning`（或 `reasoning_content`）兩欄；`max_tokens` 太小會卡在 thinking 階段
- qwen3.6:35b-a3b-mlx-bf16 預設開 thinking 模式，首 token 延遲較長（思考完才輸出）
- `/Volumes/Data-1` 沒掛載時，`glm-5 / qwen3.5-397b / deepseek-r1-671b` LaunchAgent 會反覆 crash，這是預期
