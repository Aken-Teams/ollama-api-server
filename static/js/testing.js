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

// 每個模型卡片裡的提示詞複製（包含使用者的 API Key）
function copyModelPrompt(modelId, lang) {
    const baseUrl = EXTERNAL_URL;
    const apiKey = currentApiKey || 'YOUR_API_KEY';

    if (apiKey === 'pj-admin-zhpjaiaoi-2024') {
        alert('你目前使用的是系統預設金鑰，請登出後重新登入以取得個人 API Key。');
        return;
    }

    let text = '';
    if (lang === 'python') {
        text = `請幫我用 Python 串接以下 AI API（OpenAI 相容格式）：

API 連線資訊：
- Base URL: ${baseUrl}
- API Key: ${apiKey}
- 模型: ${modelId}

用 requests 的範例：
\`\`\`python
import requests

API_URL = "${baseUrl}"
API_KEY = "${apiKey}"

response = requests.post(
    f"{API_URL}/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "model": "${modelId}",
        "messages": [{"role": "user", "content": "你好"}],
        "stream": False
    }
)
print(response.json()["choices"][0]["message"]["content"])
\`\`\`

用 OpenAI SDK 的範例：
\`\`\`python
from openai import OpenAI

client = OpenAI(base_url="${baseUrl}/v1", api_key="${apiKey}")
resp = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "你好"}]
)
print(resp.choices[0].message.content)
\`\`\`

請基於以上連線資訊與 API Key，幫我完成需求。`;

    } else if (lang === 'curl') {
        text = `curl -X POST ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [{"role": "user", "content": "你好"}]
  }'`;
    }

    navigator.clipboard.writeText(text).then(() => {
        alert(`已複製（含 API Key）！可直接貼入 AI 編輯器或終端使用。`);
    });
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

function showModelKeyPanel(index, modelId) {
    const panel = document.getElementById(`api-guide-${index}`);
    if (!panel) return;

    // Toggle
    if (panel.classList.contains('show')) {
        panel.classList.remove('show');
        return;
    }

    const baseUrl = EXTERNAL_URL;
    const apiKey = currentApiKey || 'YOUR_API_KEY';
    const isMasterKey = apiKey === 'pj-admin-zhpjaiaoi-2024';
    const displayKey = isMasterKey ? '（請重新登入取得個人 Key）' : apiKey;
    const maskedKey = isMasterKey ? '（請重新登入）' : (apiKey.length > 12 ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : apiKey);

    // 預建提示詞
    const pythonPrompt = `請幫我用 Python 串接以下 AI API（OpenAI 相容格式）：

API 連線資訊：
- Base URL: ${baseUrl}
- API Key: ${displayKey}
- Model: ${modelId}

用 requests：
import requests
response = requests.post("${baseUrl}/v1/chat/completions",
    headers={"Authorization": "Bearer ${displayKey}", "Content-Type": "application/json"},
    json={"model": "${modelId}", "messages": [{"role": "user", "content": "你好"}]})
print(response.json()["choices"][0]["message"]["content"])

用 OpenAI SDK：
from openai import OpenAI
client = OpenAI(base_url="${baseUrl}/v1", api_key="${displayKey}")
resp = client.chat.completions.create(model="${modelId}", messages=[{"role": "user", "content": "你好"}])
print(resp.choices[0].message.content)

請基於以上連線資訊與 API Key，幫我完成需求。`;

    const curlPrompt = `curl -X POST ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${modelId}", "messages": [{"role": "user", "content": "你好"}]}'`;

    // 存到全域供複製用
    window._panelPrompts = window._panelPrompts || {};
    window._panelPrompts[index] = { python: pythonPrompt, curl: curlPrompt };

    const masterKeyWarning = isMasterKey ? `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; color: #dc2626;">
                你目前使用的是系統預設金鑰，請登出後重新登入以取得個人 API Key。
            </div>` : '';

    panel.innerHTML = `
        <div style="font-size: 13px;">
            ${masterKeyWarning}
            <!-- 連線資訊（含 Base URL + Model + API Key） -->
            <div style="background: #f8f9fa; border-radius: 8px; padding: 14px; margin-bottom: 14px; font-family: monospace; font-size: 12px; line-height: 1.8;">
                <div><span style="color: #999;">Base URL:</span> <strong style="color: #0284c7;">${baseUrl}</strong></div>
                <div><span style="color: #999;">Model:</span> <strong>${modelId}</strong></div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: #999;">API Key:</span>
                    <code id="key-display-${index}" style="font-weight: 600; ${isMasterKey ? 'color: #dc2626;' : ''}">${maskedKey}</code>
                    ${isMasterKey ? '' : `<button onclick="toggleKeyVisible(${index})" style="border: 1px solid #ddd; background: #fff; border-radius: 4px; padding: 1px 8px; cursor: pointer; font-size: 11px; color: #666;">顯示</button>`}
                </div>
            </div>

            <!-- 複製按鈕列 -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
                ${isMasterKey ? '' : `<button onclick="navigator.clipboard.writeText('${apiKey}').then(()=>alert('API Key 已複製'))"
                    style="border: 1px solid #ddd; background: #fff; border-radius: 20px; padding: 5px 14px; cursor: pointer; font-size: 12px; color: #333;">
                    複製 API Key
                </button>`}
                <button onclick="navigator.clipboard.writeText('${baseUrl}').then(()=>alert('Base URL 已複製'))"
                    style="border: 1px solid #ddd; background: #fff; border-radius: 20px; padding: 5px 14px; cursor: pointer; font-size: 12px; color: #333;">
                    複製 Base URL
                </button>
                ${isMasterKey ? '' : `<button onclick="copyPanelPrompt(${index}, 'python')"
                    style="border: 1px solid #f59e0b; background: #fff7ed; border-radius: 20px; padding: 5px 14px; cursor: pointer; font-size: 12px; color: #ea580c;">
                    複製 Python 提示詞
                </button>
                <button onclick="copyPanelPrompt(${index}, 'curl')"
                    style="border: 1px solid #86efac; background: #f0fdf4; border-radius: 20px; padding: 5px 14px; cursor: pointer; font-size: 12px; color: #16a34a;">
                    複製 cURL 指令
                </button>`}
            </div>

            <!-- 申請 Key / 重新登入 -->
            <div style="border-top: 1px solid #f3f4f6; padding-top: 12px; display: flex; align-items: center; gap: 12px;">
                ${isMasterKey
                    ? `<button onclick="handleLogout()" style="background: #ef4444; color: #fff; border: none; border-radius: 20px; padding: 5px 16px; cursor: pointer; font-size: 12px;">重新登入取得個人 Key</button>`
                    : `<span style="color: #999; font-size: 12px;">需要新的 Key？</span>
                       <button onclick="switchTab('admin'); setTimeout(()=>switchAdminSubTab(document.querySelector('.admin-sub-tab'), 'keys'), 100)"
                           style="background: #f59e0b; color: #fff; border: none; border-radius: 20px; padding: 5px 16px; cursor: pointer; font-size: 12px;">
                           前往申請
                       </button>`
                }
            </div>
        </div>
    `;
    panel.classList.add('show');
}

function copyPanelPrompt(index, lang) {
    const prompts = (window._panelPrompts || {})[index];
    if (!prompts || !prompts[lang]) return;
    navigator.clipboard.writeText(prompts[lang]).then(() => {
        alert(lang === 'python' ? 'Python 提示詞已複製（含 API Key）！' : 'cURL 指令已複製（含 API Key）！');
    });
}

function toggleKeyVisible(index) {
    const el = document.getElementById('key-display-' + index);
    if (!el) return;
    const apiKey = currentApiKey || 'YOUR_API_KEY';
    const maskedKey = apiKey.length > 12 ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : apiKey;
    if (el.textContent === maskedKey) {
        el.textContent = apiKey;
    } else {
        el.textContent = maskedKey;
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
        const providerOrder = ['llama.cpp', 'Ollama', 'DeepSeek'];
        const sortedProviders = Object.keys(groups).sort((a, b) => {
            const ia = providerOrder.indexOf(a);
            const ib = providerOrder.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });

        grid.innerHTML = sortedProviders.map(provider => {
            const guide = getProviderGuide(provider);
            const models = groups[provider];

            const cardsHtml = models.map(({ model, index }) => {
                return `
                    <div class="model-test-card" id="model-card-${index}" data-model="${model.id}">
                        <div class="model-card-header">
                            <div class="model-card-name">${model.id}</div>
                            <span class="model-card-status idle" id="status-${index}">待測試</span>
                        </div>
                        <div class="model-card-info">
                            來源: <span class="provider-badge ${guide.badgeClass}">${guide.label}</span>
                        </div>
                        <div class="model-card-response" id="response-${index}"></div>
                        <div class="model-card-actions">
                            <button class="model-card-btn test" id="btn-${index}" onclick="testSingleModel(${index})">
                                測試
                            </button>
                            <button class="model-card-btn" onclick="showModelKeyPanel(${index}, '${model.id}')" style="background:#f0f9ff;color:#0284c7;border-color:#7dd3fc;">
                                申請 Key
                            </button>
                            <button class="model-card-btn" onclick="copyModelPrompt('${model.id}', 'python')" style="background:#fff7ed;color:#ea580c;border-color:#f59e0b;">
                                Python 提示詞
                            </button>
                            <button class="model-card-btn" onclick="copyModelPrompt('${model.id}', 'curl')" style="background:#f0fdf4;color:#16a34a;border-color:#86efac;">
                                cURL
                            </button>
                        </div>
                        <div class="model-card-api-guide" id="api-guide-${index}"></div>
                    </div>
                `;
            }).join('');

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
        const apiResponse = await authFetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model.id,
                messages: [{ role: 'user', content: '你好，請用一句話回應' }],
                max_tokens: 50,
                stream: false
            })
        });

        const elapsed = Date.now() - startTime;

        if (!apiResponse.ok) {
            throw new Error(`HTTP ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        let content = '';

        if (data.choices && data.choices[0] && data.choices[0].message) {
            content = data.choices[0].message.content;
        }

        // 成功
        card.className = 'model-test-card success';
        status.className = 'model-card-status success';
        status.textContent = `成功 (${(elapsed/1000).toFixed(1)}s)`;
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
    testAllIcon.textContent = '⏳';

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
    testAllIcon.textContent = '▶️';
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

    const startTime = Date.now();

    // 構建訊息內容 (支援視覺模型的圖片)
    let userContent;
    const isVisionModel = model && (model.toLowerCase().includes('vl') || model.toLowerCase().includes('vision'));

    // 根據模型類型顯示不同的提示訊息
    if (isVisionModel) {
        aiStatus.textContent = '處理中（視覺模型需要較長時間）...';
        aiContent.innerHTML = `
            <div class="vision-notice">
                <div class="notice-icon">🖼️</div>
                <div class="notice-text">
                    <strong>視覺模型處理中</strong><br>
                    由於視覺模型 (72B 參數) 需要處理圖片資訊，回應時間可能需要 30 秒至 2 分鐘，請耐心等候...
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
            aiContent.innerHTML = formatMarkdown(fullContent);
            aiStatus.textContent = '回覆完成';
            aiStatus.classList.remove('streaming');
            aiTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;
            if (totalTokens > 0) {
                aiTokens.textContent = `${totalTokens} tokens`;
            }
            lastRawResponse = { streaming: true, content: fullContent, lastChunk: lastChunkData };
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
            rawJson.textContent = JSON.stringify(data, null, 2);

            if (data.choices?.[0]?.message?.content) {
                const content = data.choices[0].message.content;
                lastAIContent = content;
                aiContent.innerHTML = formatMarkdown(content);
                aiStatus.textContent = '回覆完成';
                aiStatus.classList.remove('streaming');

                if (data.usage) {
                    aiTokens.textContent = `${data.usage.total_tokens} tokens`;
                }
                aiTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;
            } else if (data.error) {
                aiContent.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(data.error.message || JSON.stringify(data.error))}</div>`;
                aiStatus.textContent = '發生錯誤';
                aiStatus.classList.remove('streaming');
            }
        }
    } catch (error) {
        aiContent.innerHTML = `<div style="color: #dc3545;">❌ 連接錯誤: ${escapeHtml(error.message)}</div>`;
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
            const originalText = btn.textContent;
            btn.textContent = '✅ 已複製!';
            setTimeout(() => {
                btn.textContent = originalText;
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