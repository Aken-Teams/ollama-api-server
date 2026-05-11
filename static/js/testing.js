// ==========================================================================
// TESTING MODULE
// ==========================================================================

// --- Unused legacy prompt helpers (kept for backward compat) ---

function copyAiPrompt(lang) {
    const baseUrl = window.location.origin;
    const prompts = {
        'python': `我要使用一個 OpenAI 相容的私有 API 服務。請幫我用 Python requests 串接。

API 資訊：
- Base URL: ${baseUrl}
- 認證: Authorization: Bearer YOUR_API_KEY
- Chat 端點: POST /v1/chat/completions
- 模型列表: GET /v1/models
- Embeddings: POST /v1/embeddings
- 語音轉文字: POST /v1/audio/transcriptions
- OCR: POST /v1/ocr/recognize

可用模型：
- gpt-oss:120b（地端 120B 大模型）
- gemma4:31b（地端 Google Gemma4）
- Qwen3.5:122b（地端通義千問 MoE）
- qwen2.5:72b（地端 Ollama）
- deepseek-chat（雲端 DeepSeek 對話）
- deepseek-reasoner（雲端 DeepSeek 推理）
- llava:7b（地端視覺模型，支援圖片）

請用 Python requests 寫出：
1. 基本對話函數（支援 stream）
2. 列出所有模型
3. 錯誤處理`,

        'javascript': `我要使用一個 OpenAI 相容的私有 API 服務。請幫我用 JavaScript fetch 串接。

API 資訊：
- Base URL: ${baseUrl}
- 認證: Authorization: Bearer YOUR_API_KEY
- Chat 端點: POST /v1/chat/completions
- Embeddings: POST /v1/embeddings

可用模型：gpt-oss:120b, gemma4:31b, Qwen3.5:122b, qwen2.5:72b, deepseek-chat, deepseek-reasoner, llava:7b

請用 JavaScript fetch 寫出：
1. 基本對話函數（支援 stream 用 ReadableStream）
2. 非串流對話
3. 錯誤處理
所有回應格式與 OpenAI API 完全相同。`,

        'curl': `# PJ_API — OpenAI 相容 API
# Base URL: ${baseUrl}

# 對話（非串流）
curl -X POST ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-oss:120b",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# 對話（串流）
curl -X POST ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'

# 列出模型
curl ${baseUrl}/v1/models -H "Authorization: Bearer YOUR_API_KEY"

# Embeddings
curl -X POST ${baseUrl}/v1/embeddings \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "Qwen3-Embedding-8B", "input": "測試文字"}'`,

        'openai-sdk': `我要用 OpenAI Python SDK 串接一個私有 API 服務（相容 OpenAI 格式）。

設定方式：
\`\`\`python
from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="YOUR_API_KEY"
)
\`\`\`

可用模型：gpt-oss:120b, gemma4:31b, Qwen3.5:122b, qwen2.5:72b, deepseek-chat, deepseek-reasoner, llava:7b
Embedding 模型：Qwen3-Embedding-8B

請幫我用 openai SDK 寫出：
1. chat.completions.create（串流和非串流）
2. embeddings.create
3. client.models.list()
4. 視覺模型帶圖片的對話（llava:7b）`
    };

    const text = prompts[lang];
    if (!text) return;

    // Show preview
    document.getElementById('ai-prompt-text').textContent = text;
    document.getElementById('ai-prompt-preview').style.display = 'block';

    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
        alert('提示詞已複製到剪貼簿！請貼入 AI 編輯器使用。');
    });
}

function copyAiPromptText() {
    const text = document.getElementById('ai-prompt-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert('已複製！');
    });
}

// =====================================================================
// 新版按鈕：給 AI 編輯器的完整 prompt（含 Key、模型、坑、多語言範例）
// =====================================================================
function copyAiCodingPrompt(modelId) {
    const baseUrl = EXTERNAL_URL;
    const apiKey = currentApiKey || 'YOUR_API_KEY';

    if (apiKey === 'pj-admin-zhpjaiaoi-2024') {
        alert('你目前使用的是系統預設金鑰，請登出後重新登入以取得個人 API Key。');
        return;
    }

    // 偵測該模型是否為 reasoning / vision / embedding，提示 AI 該注意哪些回應欄位
    const isReasoning = /gpt-oss|deepseek-v4-pro|deepseek-reasoner|gemma3|gemma4/i.test(modelId);
    const isEmbedding = /embedding/i.test(modelId);
    const isReranker  = /reranker/i.test(modelId);

    const notes = [];
    if (isReasoning) notes.push("• 這是 reasoning 模型，回應中可能會有 `message.reasoning_content`（思考過程）跟 `message.content`（最終答案）兩個欄位 — 要把它們分開呈現給使用者");
    if (isEmbedding) notes.push("• 這是 embedding 模型，要用 `/v1/embeddings` 端點，body: `{model, input}`，回 `data[].embedding` 浮點陣列");
    if (isReranker)  notes.push("• 這是 reranker 模型，搭配 embedding 使用做 retrieval rerank，請查 `/v1/rerank`（或 chat completion 模式）");
    if (!isEmbedding && !isReranker) {
        notes.push("• 一般 chat 模型：`/v1/chat/completions`，body: `{model, messages:[{role,content}], stream}`");
        notes.push("• 串流：設 `stream: true`，會回 SSE（`data: {...}\\n\\n`），最後一行是 `data: [DONE]`");
    }
    notes.push("• 認證統一用 header `Authorization: Bearer <KEY>`，CORS 從瀏覽器直連可能受限，建議由後端代理");

    const text = `# 任務：把以下 AI API 接到我目前的專案

## 連線資訊
- **Base URL**: \`${baseUrl}\`
- **API Key**: \`${apiKey}\`
- **Model**: \`${modelId}\`
- **協定**: OpenAI 相容（直接用 OpenAI SDK 也可）

## 注意事項
${notes.join('\n')}

## 你的工作
請依我目前專案的語言/框架（自行偵測 package.json / requirements.txt / go.mod 等），加入以下功能：

1. 建立一個 API client（環境變數 \`OPENAI_API_KEY\`、\`OPENAI_BASE_URL\` 各自對應上面的值；不要把 key 寫死在程式碼）
2. 寫一個 \`chat(prompt: str, *, stream=False)\` 函式（Python）或對應語言的等價函式
3. 串流模式回 generator/AsyncIterable，逐塊 yield content
4. 錯誤處理：401 → 提示 key 失效；429 → backoff；其他 5xx → 重試一次
5. 在 README 加一段「環境變數設定」說明

## 參考片段

### Python（requests）
\`\`\`python
import requests
r = requests.post("${baseUrl}/v1/chat/completions",
    headers={"Authorization": "Bearer ${apiKey}", "Content-Type": "application/json"},
    json={"model": "${modelId}", "messages": [{"role":"user","content":"你好"}]})
print(r.json()["choices"][0]["message"]["content"])
\`\`\`

### Python（OpenAI SDK）
\`\`\`python
from openai import OpenAI
client = OpenAI(base_url="${baseUrl}/v1", api_key="${apiKey}")
resp = client.chat.completions.create(model="${modelId}",
    messages=[{"role":"user","content":"你好"}])
print(resp.choices[0].message.content)
\`\`\`

### Node / TypeScript
\`\`\`ts
const r = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: { "Authorization": "Bearer ${apiKey}", "Content-Type": "application/json" },
  body: JSON.stringify({ model: "${modelId}", messages: [{role:"user", content:"你好"}] })
});
const j = await r.json();
console.log(j.choices[0].message.content);
\`\`\`

### cURL
\`\`\`bash
curl -X POST ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${modelId}","messages":[{"role":"user","content":"你好"}]}'
\`\`\`

請依以上規格在我的專案中實作。`;

    navigator.clipboard.writeText(text).then(() => {
        alert('🤖 AI 提示詞已複製！\n\n貼到 Claude Code / Cursor / Copilot Chat，它會依你的專案結構幫你接好。');
    });
}

// =====================================================================
// 一鍵申請 Key — 漂亮 modal 版
// =====================================================================
function quickCreateKey(modelId) {
    // 移除任何已存在的同名 backdrop（防快速雙擊）
    document.querySelectorAll('.qck-backdrop').forEach(n => n.remove());

    const backdrop = document.createElement('div');
    backdrop.className = 'qck-backdrop';
    backdrop.innerHTML = `
        <div class="qck-modal" role="dialog" aria-modal="true" aria-labelledby="qck-title">
            <div class="qck-header">
                <div class="qck-header-icon">🔑</div>
                <div style="flex:1;">
                    <h3 class="qck-title" id="qck-title">一鍵申請 API Key</h3>
                    <div class="qck-subtitle">Key 建立後會立即顯示一次，並自動複製到剪貼簿</div>
                </div>
                <button class="qck-close" type="button" aria-label="關閉">×</button>
            </div>

            <!-- 表單階段 -->
            <div class="qck-stage qck-stage-form">
                <div class="qck-body">
                    <div class="qck-pill">🤖 ${modelId}</div>
                    <label class="qck-label" for="qck-name">用途名稱</label>
                    <input class="qck-input" id="qck-name" type="text"
                           placeholder="例：王小明-OCR-測試"
                           maxlength="40" autocomplete="off" />
                    <div class="qck-hint">至少 2 個字元，允許英文／數字／底線／橫線／中文</div>
                    <div class="qck-error" id="qck-error"></div>
                </div>
                <div class="qck-footer">
                    <button class="qck-btn qck-btn-cancel" type="button" data-action="cancel">取消</button>
                    <button class="qck-btn qck-btn-primary" type="button" data-action="confirm">
                        建立並複製
                    </button>
                </div>
            </div>

            <!-- 成功階段 -->
            <div class="qck-stage qck-stage-success" style="display:none;">
                <div class="qck-body" style="text-align:center;">
                    <div class="qck-success-icon">✓</div>
                    <div style="font-weight:700; font-size:15px; color:#0f172a;">已建立並複製到剪貼簿</div>
                    <div style="font-size:12px; color:#64748b; margin-top:4px;" id="qck-success-meta"></div>
                    <div class="qck-keybox" id="qck-keybox"></div>
                    <div class="qck-warn">
                        ⚠️ 此 Key 不會再顯示。請立刻貼到你的 <code>.env</code>
                        或 AI 編輯器中保存。
                    </div>
                </div>
                <div class="qck-footer">
                    <button class="qck-btn qck-btn-cancel" type="button" data-action="copy-again">重新複製</button>
                    <button class="qck-btn qck-btn-primary" type="button" data-action="close">完成</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    const $ = (sel) => backdrop.querySelector(sel);
    const input = $('#qck-name');
    const errorEl = $('#qck-error');
    const stageForm = $('.qck-stage-form');
    const stageSuccess = $('.qck-stage-success');
    const confirmBtn = $('[data-action="confirm"]');
    let createdKey = '';

    const close = () => {
        backdrop.style.opacity = '0';
        setTimeout(() => backdrop.remove(), 150);
        document.removeEventListener('keydown', onKey);
    };
    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.classList.add('show');
        input.focus();
    };
    const clearError = () => {
        errorEl.classList.remove('show');
        errorEl.textContent = '';
    };

    const submit = async () => {
        clearError();
        const name = input.value.trim();
        if (name.length < 2) {
            showError('用途名稱至少 2 個字元');
            return;
        }
        if (!/^[\w一-龥-]+$/.test(name)) {
            showError('只允許英文、數字、底線、橫線、中文');
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = '建立中...';

        try {
            const resp = await authFetch(`${API_URL}/api/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: name,
                    description: `為模型 ${modelId} 申請 — ${name}`,
                    is_admin: false
                })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                if (resp.status === 401 || resp.status === 403) {
                    showError('一鍵申請僅限 admin 帳號使用。請聯絡管理員，或登入 admin 後再操作。');
                } else {
                    showError(data.detail || `HTTP ${resp.status}`);
                }
                return;
            }
            createdKey = data.api_key || data.key || '';
            if (!createdKey) {
                showError('建立成功，但回應中沒有 key。請到「管理 → API Keys」查看。');
                return;
            }
            // 自動複製
            await navigator.clipboard.writeText(createdKey).catch(()=>{});
            // 切到成功階段
            stageForm.style.display = 'none';
            stageSuccess.style.display = 'block';
            $('#qck-success-meta').textContent = `用途：${name} ・ 模型：${modelId}`;
            $('#qck-keybox').textContent = createdKey;
        } catch (e) {
            showError(e.message || String(e));
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '建立並複製';
        }
    };

    // 事件
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });
    backdrop.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = btn.getAttribute('data-action');
            if (a === 'cancel' || a === 'close') close();
            else if (a === 'confirm') submit();
            else if (a === 'copy-again') {
                navigator.clipboard.writeText(createdKey).then(() => {
                    btn.textContent = '✓ 已複製';
                    setTimeout(() => { btn.textContent = '重新複製'; }, 1500);
                });
            }
        });
    });
    backdrop.querySelector('.qck-close').addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        clearError();
    });
    const onKey = (e) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    // 自動 focus
    setTimeout(() => input.focus(), 50);
}

// =====================================================================
// 顯示 / 收合 inline 範例（不複製、純檢視）
// =====================================================================
function toggleSnippet(index, modelId) {
    const panel = document.getElementById(`snippet-${index}`);
    if (!panel) return;
    if (panel.classList.contains('show')) {
        panel.classList.remove('show');
        panel.innerHTML = '';
        return;
    }
    const baseUrl = EXTERNAL_URL;
    const apiKey  = (currentApiKey === 'pj-admin-zhpjaiaoi-2024') ? 'YOUR_API_KEY' : (currentApiKey || 'YOUR_API_KEY');
    panel.innerHTML = `
        <div style="background:#0f172a;color:#e2e8f0;border-radius:8px;padding:12px;margin-top:8px;font-size:11px;font-family:Menlo,Monaco,monospace;line-height:1.5;overflow-x:auto;">
<div style="color:#7dd3fc;margin-bottom:4px;"># Python (OpenAI SDK)</div>from openai import OpenAI
client = OpenAI(base_url="${baseUrl}/v1", api_key="${apiKey}")
r = client.chat.completions.create(model="${modelId}",
    messages=[{"role":"user","content":"你好"}])
print(r.choices[0].message.content)

<div style="color:#7dd3fc;margin:8px 0 4px;"># cURL</div>curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${modelId}","messages":[{"role":"user","content":"你好"}]}'

<div style="color:#7dd3fc;margin:8px 0 4px;">// Node / TypeScript</div>const r = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: { "Authorization": "Bearer ${apiKey}", "Content-Type": "application/json" },
  body: JSON.stringify({ model: "${modelId}", messages: [{role:"user",content:"你好"}] })
});
console.log((await r.json()).choices[0].message.content);
        </div>`;
    panel.classList.add('show');
}

// --- Original testing functions ---

function getProviderGuide(provider) {
    return providerGuides[provider] || {
        label: provider || "未知",
        badgeClass: "local",
        color: "#64748b",
        guide: "",
        endpoint: "",
        link: null,
        linkText: null
    };
}

function toggleProviderGroup(provider) {
    const header = document.querySelector(`.provider-group-header[data-provider="${provider}"]`);
    const body = document.querySelector(`.provider-group-body[data-provider="${provider}"]`);
    if (header && body) {
        header.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
    }
}

// 初始化快速測試模型列表（僅在已登入時）
document.addEventListener('DOMContentLoaded', function() {
    if (isAuthenticated && currentApiKey) {
        loadQuickTestModels();
    }
});

// 載入模型列表到快速測試區塊
async function loadQuickTestModels() {
    const grid = document.getElementById('model-test-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="model-test-loading">載入模型列表中...</div>';

    try {
        const response = await authFetch(`${API_URL}/v1/models`);
        const data = await response.json();

        quickTestModels = data.data || [];
        if (window.AppStore) AppStore.set('quickTestModels', quickTestModels);

        if (quickTestModels.length === 0) {
            grid.innerHTML = '<div class="model-test-loading">沒有可用的模型</div>';
            return;
        }

        // 按 provider 分組，保留原始 index
        const groups = {};
        quickTestModels.forEach((model, index) => {
            const provider = model.provider || model.owned_by || '未知';
            if (!groups[provider]) {
                groups[provider] = [];
            }
            groups[provider].push({ model, index });
        });

        // 定義排序順序
        const providerOrder = ['llama.cpp', 'Ollama', 'MLX', 'DeepSeek'];
        const sortedProviders = Object.keys(groups).sort((a, b) => {
            const ia = providerOrder.indexOf(a);
            const ib = providerOrder.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });

        grid.innerHTML = sortedProviders.map(provider => {
            const guide = getProviderGuide(provider);
            const models = groups[provider];

            // 行列顯示：每個模型一列，欄位齊整
            const rowsHtml = models.map(({ model, index }) => {
                return `
                    <div class="model-row" id="model-card-${index}" data-model="${model.id}">
                        <div class="model-row-main">
                            <div class="model-row-name" title="${model.id}">${model.id}</div>
                            <span class="provider-badge ${guide.badgeClass}">${guide.label}</span>
                            <span class="model-card-status idle" id="status-${index}">待測試</span>
                            <div class="model-row-actions">
                                <button class="model-card-btn test" id="btn-${index}" onclick="testSingleModel(${index})" title="實際發一個簡單問題給模型驗證可用">
                                    🧪 測試
                                </button>
                                <button class="model-card-btn" onclick="openModelCard('${model.id}')" style="background:#faf5ff;color:#7c3aed;border-color:#c4b5fd;" title="顯示此模型的說明卡">
                                    說明卡
                                </button>
                            </div>
                        </div>
                        <div class="model-row-extras">
                            <div class="model-card-response" id="response-${index}"></div>
                            <div class="model-card-snippet" id="snippet-${index}"></div>
                        </div>
                    </div>
                `;
            }).join('');
            const cardsHtml = rowsHtml;

            return `
                <div class="provider-group">
                    <div class="provider-group-header" data-provider="${provider}" onclick="toggleProviderGroup('${provider}')">
                        <span class="toggle-icon">▼</span>
                        <span class="provider-badge ${guide.badgeClass}">${guide.label}</span>
                        <span class="provider-group-title">${provider}</span>
                        <span class="provider-model-count">${models.length} 個模型</span>
                    </div>
                    <div class="provider-group-body" data-provider="${provider}">
                        <div class="model-test-grid">
                            ${cardsHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        refreshIcons();
        applyTestBtnToggles();

    } catch (error) {
        console.error('載入模型失敗:', error);
        grid.innerHTML = `<div class="model-test-loading" style="color: #dc3545;">載入失敗: ${error.message}</div>`;
    }
}

// 重新整理模型列表
function refreshModelList() {
    loadQuickTestModels();
    // 重置統計
    updateTestSummary(0, 0, quickTestModels.length);
    document.getElementById('test-summary').style.display = 'none';
    document.getElementById('test-progress-bar').style.display = 'none';
}

// 測試單個模型
async function testSingleModel(index) {
    const model = quickTestModels[index];
    if (!model) return;

    const card = document.getElementById(`model-card-${index}`);
    const status = document.getElementById(`status-${index}`);
    const response = document.getElementById(`response-${index}`);
    const btn = document.getElementById(`btn-${index}`);

    // 設定為測試中狀態
    card.className = 'model-test-card testing';
    status.className = 'model-card-status testing';
    status.textContent = '測試中...';
    btn.disabled = true;
    response.className = 'model-card-response';
    response.textContent = '';

    const startTime = Date.now();

    try {
        // 發送簡單的測試問題
        // max_tokens 設大一點：reasoning 模型（Qwen3.6 / gpt-oss / gemma4:31b / nemotron3）
        // 必須先跑完 thinking 才會輸出 content，太小會卡在思考階段、content=""
        const apiResponse = await authFetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model.id,
                messages: [{ role: 'user', content: '你好，請用一句話回應' }],
                max_tokens: 1500,
                stream: false
            })
        });

        const elapsed = Date.now() - startTime;

        if (!apiResponse.ok) {
            throw new Error(`HTTP ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        let content = '';
        let usedReasoning = false;

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const msg = data.choices[0].message;
            content = msg.content || '';
            if (!content) {
                const reasoning = msg.reasoning || msg.reasoning_content || '';
                if (reasoning) {
                    content = `（思考中，未輸出最終答覆）${reasoning}`;
                    usedReasoning = true;
                }
            }
        }

        // 成功
        card.className = 'model-test-card success';
        status.className = 'model-card-status success';
        status.textContent = `成功 (${(elapsed/1000).toFixed(1)}s)${usedReasoning ? ' · thinking' : ''}`;
        response.textContent = content.substring(0, 150) + (content.length > 150 ? '...' : '');
        response.className = 'model-card-response show';

        return { success: true, elapsed };

    } catch (error) {
        // 失敗
        card.className = 'model-test-card failed';
        status.className = 'model-card-status failed';
        status.textContent = '失敗';
        response.textContent = error.message;
        response.className = 'model-card-response show';

        return { success: false, error: error.message };

    } finally {
        btn.disabled = false;
    }
}

// 測試全部模型
async function testAllModels() {
    if (isTestingAll) return;
    if (quickTestModels.length === 0) {
        alert('沒有可用的模型');
        return;
    }

    isTestingAll = true;
    const testAllIcon = document.getElementById('test-all-icon');
    testAllIcon.innerHTML = lucideIcon('loader', 'icon-sm');
    refreshIcons();

    // 顯示進度條和摘要
    const progressBar = document.getElementById('test-progress-bar');
    const progressFill = document.getElementById('test-progress-fill');
    const progressText = document.getElementById('test-progress-text');
    const summary = document.getElementById('test-summary');

    progressBar.style.display = 'block';
    summary.style.display = 'flex';
    progressFill.style.width = '0%';

    let successCount = 0;
    let failedCount = 0;
    const total = quickTestModels.length;

    // 重置所有卡片狀態
    for (let i = 0; i < total; i++) {
        const card = document.getElementById(`model-card-${i}`);
        const status = document.getElementById(`status-${i}`);
        const response = document.getElementById(`response-${i}`);
        if (card) card.className = 'model-test-card';
        if (status) {
            status.className = 'model-card-status idle';
            status.textContent = '等待中';
        }
        if (response) response.className = 'model-card-response';
    }

    updateTestSummary(0, 0, total);

    // 依序測試每個模型
    for (let i = 0; i < total; i++) {
        progressText.textContent = `${i + 1} / ${total}`;
        progressFill.style.width = `${((i + 1) / total) * 100}%`;

        const result = await testSingleModel(i);

        if (result.success) {
            successCount++;
        } else {
            failedCount++;
        }

        updateTestSummary(successCount, failedCount, total - i - 1);

        // 小延遲避免請求過於密集
        if (i < total - 1) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    isTestingAll = false;
    testAllIcon.innerHTML = lucideIcon('play', 'icon-sm');
    refreshIcons();
}

// 更新測試摘要
function updateTestSummary(success, failed, pending) {
    document.getElementById('success-count').textContent = success;
    document.getElementById('failed-count').textContent = failed;
    document.getElementById('pending-count').textContent = pending;
}

// 測試列出模型
async function testListModels() {
    const responseBox = document.getElementById('models-response');
    responseBox.style.display = 'block';
    responseBox.textContent = '載入中...';

    try {
        const response = await authFetch(`${API_URL}/v1/models`);
        const data = await response.json();
        responseBox.textContent = JSON.stringify(data, null, 2);
        // 同時更新下拉選單
        loadModelOptions();
    } catch (error) {
        responseBox.textContent = `錯誤: ${error.message}`;
    }
}

// 儲存原始 JSON 回應
let lastRawResponse = null;
let lastAIContent = '';

// 測試聊天完成
async function testChatCompletion() {
    const model = document.getElementById('model-select').value;
    const systemPrompt = document.getElementById('system-prompt').value;
    const userMessage = document.getElementById('user-message').value;
    const streamMode = document.getElementById('stream-mode').checked;

    // 取得模型名稱
    const selectedModel = modelsData.find(m => m.id === model);
    const modelName = selectedModel?.info?.name || model;

    // 顯示 AI 回覆容器
    const container = document.getElementById('ai-response-container');
    const aiContent = document.getElementById('ai-content');
    const aiModelName = document.getElementById('ai-model-name');
    const aiStatus = document.getElementById('ai-status');
    const aiTokens = document.getElementById('ai-tokens');
    const aiTime = document.getElementById('ai-time');
    const rawJson = document.getElementById('raw-json');
    const rawResponse = document.getElementById('raw-response');

    container.style.display = 'block';
    aiModelName.textContent = modelName;
    aiStatus.classList.add('streaming');
    aiTokens.textContent = '';
    aiTime.textContent = '';
    rawResponse.style.display = 'none';
    lastRawResponse = null;
    lastAIContent = '';
    if (window.AppStore) {
        AppStore.set('lastRawResponse', null);
        AppStore.set('lastAIContent', '');
    }

    const startTime = Date.now();

    // 構建訊息內容 (支援視覺模型的圖片)
    let userContent;
    const isVisionModel = (typeof isVisionCapable === 'function') ? isVisionCapable(selectedModel) : false;
    const hasImage = !!(typeof uploadedImageBase64 !== 'undefined' && uploadedImageBase64);

    // 根據模型類型顯示不同的提示訊息
    if (isVisionModel && hasImage) {
        aiStatus.textContent = '處理中（視覺模型需要較長時間）...';
        aiContent.innerHTML = `
            <div class="vision-notice">
                <div class="notice-icon">${lucideIcon('image', 'icon-lg')}</div>
                <div class="notice-text">
                    <strong>視覺模型處理中</strong><br>
                    視覺模型載入圖片並推理時間視模型大小不同，請耐心等候...
                </div>
            </div>
            <span class="typing-cursor"></span>
        `;
    } else {
        aiStatus.textContent = '思考中...';
        aiContent.innerHTML = '<span class="typing-cursor"></span>';
    }

    if (isVisionModel && uploadedImageBase64) {
        // 視覺模型帶圖片的請求格式
        userContent = [
            {
                type: "image_url",
                image_url: {
                    url: uploadedImageBase64
                }
            },
            {
                type: "text",
                text: userMessage
            }
        ];
    } else {
        userContent = userMessage;
    }

    const requestBody = {
        model: model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ],
        stream: streamMode,
        temperature: 0.7
    };

    try {
        if (streamMode) {
            // 串流模式
            const response = await authFetch(`${API_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            // 檢查回應狀態
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let totalTokens = 0;
            let lastChunkData = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data.trim() === '[DONE]') continue;

                        try {
                            const json = JSON.parse(data);
                            lastChunkData = json;
                            if (json.choices?.[0]?.delta?.content) {
                                fullContent += json.choices[0].delta.content;
                                aiContent.innerHTML = formatMarkdown(fullContent) + '<span class="typing-cursor"></span>';
                                // 自動滾動到底部
                                aiContent.scrollTop = aiContent.scrollHeight;
                            }
                            if (json.usage) {
                                totalTokens = json.usage.total_tokens || 0;
                            }
                        } catch (e) {}
                    }
                }
            }

            // 完成後更新狀態
            const elapsed = Date.now() - startTime;
            lastAIContent = fullContent;
            if (window.AppStore) AppStore.set('lastAIContent', fullContent);
            aiContent.innerHTML = formatMarkdown(fullContent);
            aiStatus.textContent = '回覆完成';
            aiStatus.classList.remove('streaming');
            aiTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;
            if (totalTokens > 0) {
                aiTokens.textContent = `${totalTokens} tokens`;
            }
            lastRawResponse = { streaming: true, content: fullContent, lastChunk: lastChunkData };
            if (window.AppStore) AppStore.set('lastRawResponse', lastRawResponse);
            rawJson.textContent = JSON.stringify(lastRawResponse, null, 2);

        } else {
            // 一般模式
            const response = await authFetch(`${API_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            // 檢查回應狀態
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const elapsed = Date.now() - startTime;

            lastRawResponse = data;
            if (window.AppStore) AppStore.set('lastRawResponse', data);
            rawJson.textContent = JSON.stringify(data, null, 2);

            if (data.choices?.[0]?.message?.content) {
                const content = data.choices[0].message.content;
                lastAIContent = content;
                if (window.AppStore) AppStore.set('lastAIContent', content);
                aiContent.innerHTML = formatMarkdown(content);
                aiStatus.textContent = '回覆完成';
                aiStatus.classList.remove('streaming');

                if (data.usage) {
                    aiTokens.textContent = `${data.usage.total_tokens} tokens`;
                }
                aiTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;
            } else if (data.error) {
                aiContent.innerHTML = `<div style="color: #dc3545;">${lucideIcon('x-circle', 'icon-sm')} 錯誤: ${escapeHtml(data.error.message || JSON.stringify(data.error))}</div>`;
                aiStatus.textContent = '發生錯誤';
                aiStatus.classList.remove('streaming');
            }
        }
    } catch (error) {
        aiContent.innerHTML = `<div style="color: #dc3545;">${lucideIcon('x-circle', 'icon-sm')} 連接錯誤: ${escapeHtml(error.message)}</div>`;
        aiStatus.textContent = '連接失敗';
        aiStatus.classList.remove('streaming');
    }
}

// 複製 AI 回覆
function copyAIResponse(btn) {
    // 複製清理後的內容
    const cleanedContent = cleanModelOutput(lastAIContent);
    if (cleanedContent) {
        navigator.clipboard.writeText(cleanedContent).then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = lucideIcon('check', 'icon-sm') + ' 已複製!';
            refreshIcons();
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                refreshIcons();
            }, 2000);
        }).catch(err => {
            alert('複製失敗: ' + err.message);
        });
    } else {
        alert('沒有可複製的內容');
    }
}

// 切換原始 JSON 顯示
function toggleRawResponse() {
    const rawDiv = document.getElementById('raw-response');
    if (rawDiv.style.display === 'none') {
        rawDiv.style.display = 'block';
    } else {
        rawDiv.style.display = 'none';
    }
}

// 清理模型內部標記，只保留最終回覆

// =====================================================================
// 📊 Benchmark — 效能比較
// =====================================================================
const BENCH_PRESETS = {
    intro: '請用 100 字介紹台灣。',
    translate: 'Please translate the following sentence into English: 「下班後我喜歡走路回家，順便看夕陽。」',
    code: '寫一個 Python 函式 `is_prime(n: int) -> bool` 判斷質數，要求 O(√n)，並附 3 個測試案例。',
    reason: '小明 3 歲時，妹妹年齡是他的一半。今年小明 30 歲，妹妹幾歲？請逐步推理。',
    summary: '請用 3 句話摘要：人工智慧的發展從 1956 年達特茅斯會議開始，歷經符號主義時代、專家系統、機器學習興起，再到 2010 年代深度學習革命，2020 年代生成式 AI 進入主流，影響各產業並引發倫理討論。'
};

let _benchResults = [];   // 給匯出用
let _benchAllModels = []; // 載入過的 model 清單

function applyBenchPreset() {
    const sel = document.getElementById('bench-preset').value;
    if (sel && BENCH_PRESETS[sel]) {
        document.getElementById('bench-prompt').value = BENCH_PRESETS[sel];
    }
}

async function loadBenchModels() {
    const container = document.getElementById('bench-models');
    if (!container) return;
    try {
        const r = await authFetch(`${API_URL}/v1/models`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        _benchAllModels = (data.data || []).filter(m => {
            // 排除 embedding/reranker（不會回 chat completions）
            const id = (m.id || '').toLowerCase();
            return !id.includes('embedding') && !id.includes('reranker');
        });
        if (_benchAllModels.length === 0) {
            container.innerHTML = '<span class="hint">沒有可用模型</span>';
            return;
        }
        container.innerHTML = _benchAllModels.map((m, i) => {
            const provider = m.provider || (m.info && m.info.provider) || 'local';
            return `<label class="bench-model-chip">
                <input type="checkbox" data-model="${m.id}" checked
                       onchange="this.parentElement.classList.toggle('checked', this.checked)">
                <span>${m.id}</span>
                <span class="hint" style="font-size:10px;color:#94a3b8;">${provider}</span>
            </label>`;
        }).join('');
        // initial state
        container.querySelectorAll('.bench-model-chip').forEach(l => l.classList.add('checked'));
    } catch (e) {
        container.innerHTML = '<span class="hint" style="color:#dc2626;">載入失敗：' + e.message + '</span>';
    }
}

function benchSelectAll(on) {
    document.querySelectorAll('#bench-models input[type=checkbox]').forEach(cb => {
        cb.checked = on;
        cb.parentElement.classList.toggle('checked', on);
    });
}

function _benchProviderTag(modelId) {
    const m = _benchAllModels.find(x => x.id === modelId) || {};
    return m.provider || (m.info && m.info.provider) || (m.deployment_type === 'cloud' ? 'cloud' : 'local');
}

// 串流呼叫單一模型，回傳 {ttft_ms, total_ms, tokens, content, error}
async function _benchOnce(modelId, prompt, maxTokens) {
    const start = performance.now();
    let firstToken = null;
    let content = '';
    let tokens = 0;
    try {
        const resp = await authFetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
                temperature: 0.3,
                stream: true
            })
        });
        if (!resp.ok) {
            const t = await resp.text().catch(()=>'');
            return { error: `HTTP ${resp.status} ${t.slice(0,80)}` };
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                    const obj = JSON.parse(data);
                    const delta = obj.choices?.[0]?.delta || {};
                    const piece = delta.content || delta.reasoning_content || delta.reasoning || '';
                    if (piece) {
                        if (firstToken === null) firstToken = performance.now() - start;
                        content += piece;
                    }
                    if (obj.usage) {
                        tokens = obj.usage.completion_tokens || tokens;
                    }
                } catch {}
            }
        }
        const total = performance.now() - start;
        // tokens fallback: 粗略以 char/4 估
        if (!tokens) tokens = Math.round(content.length / 3);
        return {
            ttft_ms: firstToken || total,
            total_ms: total,
            tokens,
            content
        };
    } catch (e) {
        return { error: e.message || String(e) };
    }
}

async function runBenchmark() {
    const promptEl = document.getElementById('bench-prompt');
    const prompt = (promptEl.value || '').trim();
    if (!prompt) { alert('請先輸入 prompt 或選擇預設'); return; }
    const maxTokens = parseInt(document.getElementById('bench-max-tokens').value, 10) || 300;
    const repeat = parseInt(document.getElementById('bench-repeat').value, 10) || 1;
    const checked = Array.from(document.querySelectorAll('#bench-models input[type=checkbox]:checked'))
        .map(cb => cb.dataset.model);
    if (checked.length === 0) { alert('請至少勾一個模型'); return; }

    const runBtn = document.getElementById('bench-run-btn');
    const statusEl = document.getElementById('bench-status');
    const resultsBox = document.getElementById('bench-results');
    const tbody = document.querySelector('#bench-table tbody');
    runBtn.disabled = true;
    runBtn.textContent = '測試中…';
    resultsBox.style.display = 'block';
    tbody.innerHTML = '';
    const podium = document.getElementById('bench-podium');
    if (podium) { podium.innerHTML = ''; podium.style.display = 'none'; }
    _benchResults = [];

    let done = 0;
    const total = checked.length * repeat;
    statusEl.textContent = `0 / ${total}`;

    const sourceBadge = (m) => {
        const tag = _benchProviderTag(m);
        const cls = tag.toLowerCase().includes('cloud') || tag.toLowerCase() === 'deepseek' ? 'cloud' : 'local';
        return `<span class="bench-source-badge ${cls}">${tag}</span>`;
    };

    // 先建立佔位列（含排名欄）
    const rowMap = {};
    for (const m of checked) {
        const tr = document.createElement('tr');
        tr.dataset.model = m;
        tr.innerHTML = `<td class="bench-rank-cell rank-other">—</td>
            <td><strong>${m}</strong></td>
            <td>${sourceBadge(m)}</td>
            <td colspan="5" style="color:#94a3b8;">等待中…</td>`;
        tbody.appendChild(tr);
        rowMap[m] = tr;
    }

    // 對每個模型循序跑（避免互相干擾單 GPU）；同模型重複次數取平均
    for (const m of checked) {
        const runs = [];
        rowMap[m].innerHTML = `<td class="bench-rank-cell rank-other">—</td>
            <td><strong>${m}</strong></td>
            <td>${sourceBadge(m)}</td>
            <td colspan="5" style="color:#0284c7;">測試中…</td>`;
        for (let i = 0; i < repeat; i++) {
            const r = await _benchOnce(m, prompt, maxTokens);
            runs.push(r);
            done++;
            statusEl.textContent = `${done} / ${total}`;
        }
        // 聚合（只取成功的）
        const ok = runs.filter(r => !r.error);
        const failed = runs.length - ok.length;
        if (ok.length === 0) {
            rowMap[m].className = 'bench-failed';
            rowMap[m].innerHTML = `<td class="bench-rank-cell rank-failed">失敗</td>
                <td><strong>${m}</strong></td>
                <td>${sourceBadge(m)}</td>
                <td colspan="5">${runs[0].error || '失敗'}</td>`;
            _benchResults.push({ model: m, error: runs[0].error });
            continue;
        }
        const avg = (k) => ok.reduce((s, r) => s + r[k], 0) / ok.length;
        const ttft = avg('ttft_ms');
        const totalMs = avg('total_ms');
        const tokens = Math.round(avg('tokens'));
        const tokps = tokens / Math.max((totalMs - ttft) / 1000, 0.001);
        const content = ok[ok.length - 1].content;
        const result = { model: m, ttft, totalMs, tokens, tokps, content, failed, runs: ok.length };
        _benchResults.push(result);
        rowMap[m].innerHTML = `<td class="bench-rank-cell rank-other">—</td>
            <td><strong>${m}</strong>${repeat>1?` <span class="hint" style="font-size:10px;">×${repeat}avg</span>`:''}${failed?` <span style="color:#dc2626;font-size:10px;">(失敗${failed})</span>`:''}</td>
            <td>${sourceBadge(m)}</td>
            <td class="bench-num">${(ttft/1000).toFixed(2)}s</td>
            <td class="bench-num">${(totalMs/1000).toFixed(2)}s</td>
            <td class="bench-num">${tokens}</td>
            <td class="bench-num">${tokps.toFixed(1)}</td>
            <td><div class="bench-output">${(content || '').replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'}[c]))}</div></td>`;
    }

    // 排序：失敗放最後，成功的依 totalMs 升序，並標上排名
    const successRows = Array.from(tbody.querySelectorAll('tr')).filter(r => !r.classList.contains('bench-failed'));
    const failedRows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.classList.contains('bench-failed'));
    successRows.sort((a, b) => {
        const ta = _benchResults.find(x => x.model === a.dataset.model)?.totalMs ?? 999999;
        const tb = _benchResults.find(x => x.model === b.dataset.model)?.totalMs ?? 999999;
        return ta - tb;
    });
    tbody.innerHTML = '';
    successRows.forEach((r, i) => {
        const rank = i + 1;
        if (rank === 1) r.classList.add('bench-winner');
        if (i === successRows.length - 1 && successRows.length > 1) r.classList.add('bench-loser');
        const rankCell = r.querySelector('.bench-rank-cell');
        if (rankCell) {
            rankCell.textContent = String(rank);
            rankCell.classList.remove('rank-other', 'rank-1', 'rank-2', 'rank-3');
            if (rank <= 3) rankCell.classList.add('rank-' + rank);
            else rankCell.classList.add('rank-other');
        }
        tbody.appendChild(r);
    });
    failedRows.forEach(r => tbody.appendChild(r));

    // 冠軍卡片
    _renderBenchPodium(successRows.slice(0, 3).map(r => _benchResults.find(x => x.model === r.dataset.model)).filter(Boolean));

    runBtn.disabled = false;
    runBtn.textContent = '▶ 開始 benchmark';
    const failedCount = _benchResults.filter(r => r.error).length;
    statusEl.textContent = `完成 ${total} 次測試（成功 ${successRows.length} / 失敗 ${failedCount}）`;
}

function _renderBenchPodium(top) {
    const podium = document.getElementById('bench-podium');
    if (!podium) return;
    if (!top.length) { podium.style.display = 'none'; return; }
    const labels = ['冠軍', '亞軍', '季軍'];
    podium.innerHTML = top.map((r, i) => {
        const name = (r.model || '').replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'}[c]));
        return `
            <div class="bench-podium-card rank-${i+1}" title="${name}">
                <div>
                    <span class="bench-podium-rank">${i+1}</span>
                    <span class="bench-podium-label">${labels[i]}</span>
                </div>
                <div class="bench-podium-model">${name}</div>
                <div class="bench-podium-stats">
                    <span>總時間 <b>${(r.totalMs/1000).toFixed(2)}s</b></span>
                    <span>TTFT <b>${(r.ttft/1000).toFixed(2)}s</b></span>
                    <span>tok/s <b>${r.tokps.toFixed(1)}</b></span>
                </div>
            </div>`;
    }).join('');
    podium.style.display = 'grid';
}

function exportBench(fmt) {
    if (!_benchResults.length) { alert('還沒結果可匯出'); return; }
    const ok = _benchResults.filter(r => !r.error)
        .sort((a, b) => a.totalMs - b.totalMs);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let content = '', filename = '', mime = '';
    if (fmt === 'csv') {
        const rows = [['model','ttft_s','total_s','tokens','tok_per_s','provider']];
        for (const r of ok) rows.push([r.model, (r.ttft/1000).toFixed(3), (r.totalMs/1000).toFixed(3), r.tokens, r.tokps.toFixed(1), _benchProviderTag(r.model)]);
        for (const r of _benchResults.filter(r => r.error)) rows.push([r.model, '', '', '', '', 'ERROR: ' + r.error]);
        content = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g,'""')}"` : c).join(',')).join('\n');
        filename = `benchmark-${ts}.csv`;
        mime = 'text/csv';
    } else {
        content = `# Benchmark — ${new Date().toLocaleString()}\n\n`;
        content += `| 排名 | 模型 | 來源 | TTFT | 總時間 | tokens | tok/s |\n`;
        content += `|---:|---|---|---:|---:|---:|---:|\n`;
        ok.forEach((r, i) => {
            content += `| ${i+1} | ${r.model} | ${_benchProviderTag(r.model)} | ${(r.ttft/1000).toFixed(2)}s | ${(r.totalMs/1000).toFixed(2)}s | ${r.tokens} | ${r.tokps.toFixed(1)} |\n`;
        });
        const failed = _benchResults.filter(r => r.error);
        if (failed.length) {
            content += `\n## 失敗\n`;
            for (const r of failed) content += `- **${r.model}**: ${r.error}\n`;
        }
        filename = `benchmark-${ts}.md`;
        mime = 'text/markdown';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 初始化：登入後載入 benchmark 模型清單
document.addEventListener('DOMContentLoaded', () => {
    if (typeof isAuthenticated !== 'undefined' && isAuthenticated) {
        loadBenchModels();
    }
});
function toggleTestBtn(type, visible) {
    const grid = document.getElementById('model-test-grid');
    if (grid) grid.classList.toggle(`hide-btn-${type}`, !visible);
    localStorage.setItem(`test_btn_${type}`, visible ? '1' : '0');
}

function applyTestBtnToggles() {
    ['key', 'ai', 'snippet'].forEach(type => {
        const stored = localStorage.getItem(`test_btn_${type}`);
        const visible = stored !== '0';
        const cb = document.getElementById(`toggle-btn-${type}`);
        if (cb) cb.checked = visible;
        toggleTestBtn(type, visible);
    });
}

// 頁面載入時立刻套用（不等模型列表）
document.addEventListener('DOMContentLoaded', applyTestBtnToggles);

// ===== 說明卡 modal（API 測試頁）=====
let _modelCardModel = null;
let _userApiKeys = null;

async function openModelCard(modelId) {
    _modelCardModel = modelId;
    document.getElementById('modelCardTitle').textContent = `說明卡 — ${modelId}`;
    const modal = document.getElementById('modelCardModal');
    modal.style.display = 'flex';

    // Load all keys (cache)
    if (!_userApiKeys) {
        try {
            const resp = await authFetch(`${API_URL}/api/keys`);
            const data = await resp.json();
            _userApiKeys = (data.keys || []).filter(k => k.is_active);
        } catch (e) {
            _userApiKeys = [];
        }
    }

    // Populate user dropdown (deduplicated, current user first)
    const me = (() => { try { return JSON.parse(localStorage.getItem('pj_user') || '{}').username; } catch(e) { return ''; } })();
    const users = [...new Set(_userApiKeys.map(k => k.username))].sort((a, b) => {
        if (a === me) return -1;
        if (b === me) return 1;
        return a.localeCompare(b);
    });

    const userSel = document.getElementById('modelCardUserSelect');
    userSel.innerHTML = '<option value="">— 選擇使用者 —</option>';
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u + (u === me ? '（我）' : '');
        if (u === me) opt.selected = true;
        userSel.appendChild(opt);
    });

    onModelCardUserChange();
}

function onModelCardUserChange() {
    const username = document.getElementById('modelCardUserSelect').value;
    const keySel = document.getElementById('modelCardKeySelect');
    keySel.innerHTML = '';

    if (!username) {
        keySel.innerHTML = '<option value="">— 請先選使用者 —</option>';
        document.getElementById('modelCardContent').textContent = '';
        return;
    }

    const keys = (_userApiKeys || []).filter(k => k.username === username);
    if (keys.length === 0) {
        keySel.innerHTML = '<option value="">（此使用者無可用 Key）</option>';
    } else {
        keys.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k.api_key_prefix;
            opt.textContent = `${k.description || '無描述'}（${k.api_key_prefix}…）`;
            keySel.appendChild(opt);
        });
    }

    refreshModelCard();
}

function refreshModelCard() {
    const select = document.getElementById('modelCardKeySelect');
    const prefix = select.value;
    const key = prefix
        ? `${prefix}… （完整 Key 請至管理員申請）`
        : 'YOUR_API_KEY';
    const card = buildOnboardCardText(key, '', '', [_modelCardModel]);
    document.getElementById('modelCardContent').textContent = card;
    document.getElementById('modelCardCopyBtn').textContent = '複製說明卡';
}

function closeModelCard() {
    document.getElementById('modelCardModal').style.display = 'none';
}

async function copyModelCard() {
    const text = document.getElementById('modelCardContent').textContent;
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('modelCardCopyBtn');
    btn.textContent = '已複製 ✓';
    setTimeout(() => btn.textContent = '複製說明卡', 2000);
}
