// ==========================================================================
// KEYS MODULE
// ==========================================================================

let apiKeysCache = [];

async function loadApiKeys() {
    // Pre-fill username with logged-in user
    const usernameField = document.getElementById('new-key-username');
    if (usernameField && !usernameField.value) {
        try {
            const u = JSON.parse(localStorage.getItem('pj_user') || '{}');
            if (u.username) usernameField.value = u.username;
        } catch (_) {}
    }

    const container = document.getElementById('api-keys-list');
    container.innerHTML = '<p style="color: #666;">載入中...</p>';

    try {
        const response = await authFetch(`${API_URL}/api/keys`);
        if (!response.ok) {
            throw new Error('無法載入 API Keys');
        }

        const data = await response.json();
        const keys = data.keys || [];
        apiKeysCache = keys;

        if (keys.length === 0) {
            container.innerHTML = '<p style="color: #666;">尚無 API Key</p>';
            return;
        }

        // Group keys by username
        const groups = {};
        keys.forEach(key => {
            if (!groups[key.username]) groups[key.username] = [];
            groups[key.username].push(key);
        });

        const btnStyle = (border, color, bg) =>
            `padding:5px 10px; margin-right:4px; border:1px solid ${border}; border-radius:4px; cursor:pointer; background:${bg}; color:${color}; font-size:12px;`;

        const rows = Object.entries(groups).map(([username, userKeys]) => {
            const isAdmin = userKeys.some(k => k.is_admin);
            const totalUsage = userKeys.reduce((s, k) => s + k.request_count, 0);
            const multi = userKeys.length > 1;

            // Header row for this user
            const headerRow = `
                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                    <td colspan="7" style="padding:10px 14px;">
                        <span style="font-weight:700; font-size:14px;">${escapeHtml(username)}</span>
                        ${isAdmin ? '<span style="background:#ffc107;color:#000;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px;">管理員</span>' : ''}
                        <span style="color:#94a3b8; font-size:12px; margin-left:10px;">${userKeys.length} 組 Key　共 ${totalUsage.toLocaleString()} 次</span>
                    </td>
                </tr>`;

            // One row per key
            const keyRows = userKeys.map((key, idx) => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 14px 10px ${multi ? '32px' : '14px'}; color:#64748b; font-size:13px;">
                        ${multi ? `<span style="color:#cbd5e1; margin-right:6px;">${idx === userKeys.length - 1 ? '└' : '├'}</span>` : ''}
                        <span style="font-family:monospace; background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:12px;">${key.api_key_prefix}…</span>
                    </td>
                    <td style="padding:10px 12px; color:#555; font-size:13px;">${key.description ? escapeHtml(key.description) : '<span style="color:#ccc;">-</span>'}</td>
                    <td style="padding:10px 12px; font-size:13px;">
                        ${key.is_active ? '<span style="color:#28a745;">&#10003; 啟用</span>' : '<span style="color:#dc3545;">&#10007; 停用</span>'}
                    </td>
                    <td style="padding:10px 12px; font-size:13px; font-weight:${key.request_count > 0 ? 'bold' : 'normal'}; color:${key.request_count > 0 ? '#333' : '#ccc'};">${key.request_count.toLocaleString()}</td>
                    <td style="padding:10px 12px; font-size:12px; color:#94a3b8;">${key.created_at ? new Date(key.created_at).toLocaleDateString('zh-TW') : '-'}</td>
                    <td style="padding:10px 12px; font-size:12px; color:#94a3b8;">${key.last_used_at ? new Date(key.last_used_at).toLocaleString('zh-TW') : '<span style="color:#ccc;">從未</span>'}</td>
                    <td style="padding:10px 12px; white-space:nowrap;">
                        <button onclick="copyOnboardCardForKey('${escapeHtml(key.api_key_prefix)}', '${escapeHtml(key.username)}', '${escapeHtml(key.description || '')}')"
                                style="${btnStyle('#6366f1','#6366f1','#eef2ff')}">說明卡</button>
                        <button onclick="editApiKey(${key.id})"
                                style="${btnStyle('#f59e0b','#ea580c','#fff7ed')}">編輯</button>
                        <button onclick="toggleKeyStatus(${key.id}, ${!key.is_active})"
                                style="${btnStyle('#ddd', key.is_active ? '#555':'#555', key.is_active ? '#fff3cd':'#d4edda')}">
                            ${key.is_active ? '停用' : '啟用'}
                        </button>
                        <button onclick="regenerateKey(${key.id}, '${escapeHtml(key.username)}')"
                                style="${btnStyle('#17a2b8','#17a2b8','#e7f5ff')}">重新產生</button>
                        <button onclick="deleteApiKey(${key.id}, '${escapeHtml(key.username)}')"
                                style="${btnStyle('#dc3545','#dc3545','#fff')}">刪除</button>
                    </td>
                </tr>`).join('');

            return headerRow + keyRows;
        }).join('');

        container.innerHTML = `
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8f9fa; text-align:left;">
                        <th style="padding:12px; border-bottom:2px solid #dee2e6;">使用者 / Key</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6;">用途</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6;">狀態</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6;">使用次數</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6;">建立時間</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6;">最後使用</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6;">操作</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<p style="color: #dc3545;">載入失敗: ${error.message}</p>`;
    }
}

// Create new API Key
async function createApiKey() {
    const username = document.getElementById('new-key-username').value.trim();
    const description = document.getElementById('new-key-description').value.trim();
    const isAdmin = false;

    if (!username) {
        alert('無法取得登入帳號，請重新整理頁面');
        return;
    }

    if (!description) {
        alert('請輸入用途描述（例如：專案名稱或系統名稱）');
        return;
    }

    try {
        const response = await authFetch(`${API_URL}/api/keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                description: description,
                is_admin: isAdmin
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || '建立失敗');
        }

        // Show the new key
        document.getElementById('new-key-value').textContent = data.api_key;
        document.getElementById('new-key-result').style.display = 'block';

        // Generate onboarding card
        const models = getSelectedModels();
        renderOnboardCard(data.api_key, username, description, models);

        // Clear form
        document.getElementById('new-key-username').value = '';
        document.getElementById('new-key-description').value = '';
        document.getElementById('new-key-admin').checked = false;

        // Reload list
        loadApiKeys();

    } catch (error) {
        alert('建立 API Key 失敗: ' + error.message);
    }
}

// Copy new key to clipboard
function copyNewKey() {
    const keyValue = document.getElementById('new-key-value').textContent;
    navigator.clipboard.writeText(keyValue).then(() => {
        alert('API Key 已複製到剪貼簿！');
    });
}

function getSelectedModels() {
    const checks = document.querySelectorAll('#new-key-models input[type=checkbox]:checked');
    const selected = Array.from(checks).map(c => c.value);
    return selected.length ? selected : ['gemma4:latest'];
}

function toggleModelChip(checkbox) {
    const label = checkbox.closest('label');
    label.classList.toggle('chip-on', checkbox.checked);
}

// Init chip states on page load
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('#new-key-models input[type=checkbox]').forEach(cb => {
        if (cb.checked) cb.closest('label').classList.add('chip-on');
    });
});

function renderOnboardCard(apiKey, username, description, models) {
    const text = buildOnboardCardText(apiKey, username, description, models);
    document.getElementById('onboard-card').textContent = text;
}

function copyOnboardCard() {
    const text = document.getElementById('onboard-card').textContent;
    showOnboardModal(text);
}

function copyOnboardCardForKey(prefix, username, description) {
    const note = `（此 Key 前綴為 ${prefix}…，完整 Key 請點「重新產生」取得）`;
    // 找出此 key 自己的 allowed_models；若為 null（無限制），fallback 列全部已知模型
    const keyRow = apiKeysCache.find(k => k.api_key_prefix === prefix && k.username === username);
    const allowed = keyRow && Array.isArray(keyRow.allowed_models) ? keyRow.allowed_models : null;
    const list = allowed && allowed.length ? allowed : Object.keys(MODEL_META);
    const card = buildOnboardCardText(note, username, description, list);
    showOnboardModal(card);
}

// thinking=true 表示模型會先輸出 reasoning，最終答覆在 message.content；
// max_tokens 太小會卡在思考階段，content 為空字串。
const MODEL_META = {
    // llama.cpp (native)
    'gpt-oss:120b':                               { label: 'gpt-oss:120b',      note: '120B（llama.cpp），現由 MLX 21192 backend 承接', vision: false, thinking: true  },
    'gemma4:31b':                                 { label: 'gemma4:31b',        note: '31B（llama.cpp），reasoning + mmproj 多模態',     vision: false, thinking: true  },
    // Ollama local
    'gemma4:latest':                              { label: 'gemma4:latest',     note: '8B（Ollama），最快，128K context，一般對話',     vision: false, thinking: true  },
    'gemma3:27b':                                 { label: 'gemma3:27b',        note: '27B（Ollama），多模態，品質與速度均衡',           vision: false, thinking: true  },
    'nemotron3:33b':                              { label: 'nemotron3:33b',     note: '33B（Ollama），NVIDIA Omni 多模態，推理',         vision: false, thinking: true  },
    'qwen2.5vl:7b':                               { label: 'qwen2.5vl:7b',      note: '7B（Ollama），視覺模型',                          vision: true,  thinking: false },
    // MLX (Apple Silicon)
    'mlx-community/Qwen2.5-1.5B-Instruct-4bit':   { label: 'Qwen2.5-1.5B',     note: '1.5B（MLX），極快極小，分類/低延遲',             vision: false, thinking: false },
    'mlx-community/gpt-oss-120b-MXFP4-Q4':        { label: 'gpt-oss-120b MLX',  note: '120B（MLX），最強，速度比 llama.cpp 快 1.3–2x',  vision: false, thinking: true  },
    'mlx-community/gemma-3-27b-it-qat-4bit':      { label: 'gemma-3-27b MLX',   note: '27B（MLX, QAT 4-bit），長 context，視覺',         vision: false, thinking: true  },
    'mlx-community/Qwen2.5-VL-7B-Instruct-4bit':  { label: 'Qwen2.5-VL-7B',    note: '7B（MLX），視覺模型，本地 OCR/RAG',              vision: true,  thinking: false },
    'mlx-community/Qwen3.6-35B-A3B-bf16':         { label: 'Qwen3.6-35B-A3B',   note: '35B/3B 激活（MLX BF16），thinking 模型，256K',   vision: false, thinking: true  },
    // DeepSeek cloud
    'deepseek-v4-flash':                          { label: 'deepseek-v4-flash', note: 'DeepSeek V4 Flash 雲端，低延遲高吞吐',           vision: false, thinking: true  },
    'deepseek-v4-pro':                            { label: 'deepseek-v4-pro',   note: 'DeepSeek V4 Pro 雲端，深度推理',                 vision: false, thinking: true  },
};

function buildOnboardCardText(apiKey, username, description, models) {
    const baseUrl = 'https://ollama_pjapi.theaken.com';
    const list = Array.isArray(models) && models.length ? models : ['gemma4:latest'];
    const isSingleModel = list.length === 1;
    const primary = list[0];
    const primaryMeta = MODEL_META[primary] || { label: primary, note: '', vision: false, thinking: false };
    const anyThinking = list.some(id => MODEL_META[id]?.thinking);
    const anyVision   = list.some(id => MODEL_META[id]?.vision);

    // Model table — only selected models
    const modelLines = list.map(id => {
        const meta = MODEL_META[id] || { label: id, note: '', vision: false, thinking: false };
        const tags = [];
        if (meta.vision)   tags.push('vision');
        if (meta.thinking) tags.push('thinking');
        const tagStr = tags.length ? ` [${tags.join('/')}]` : '';
        return `- ${id}${tagStr}\n  ${meta.note}`;
    }).join('\n');

    // 建構限制列表
    const constraints = [];
    constraints.push(isSingleModel
        ? `這把 API Key 只能呼叫 \`${primary}\`。其他 model ID 一律會被 gateway 拒絕：**系統不認識的（例如 \`gpt-4o\`、typo）回 400**；**系統認識但這把 Key 沒權限的回 403**。所以絕對不要嘗試列表以外的模型，也不要把 400 錯誤訊息當作探測管道。`
        : `這把 API Key 只能呼叫上述列表內的 model ID。其他一律被拒絕（不認識 → 400；無權限 → 403）。`);
    constraints.push(`不可以使用 \`model: "auto"\` 或任何虛擬路由；系統已停用自動路由，務必明確指定一個真實 model ID。`);
    if (anyThinking) {
        constraints.push(`部分模型是 **thinking 模型**（標記 \`[thinking]\`）— 回應裡 \`choices[0].message\` 有兩個欄位：
   - \`content\`：最終答覆（可能為空字串！如果思考太久 tokens 不夠就沒輸出）
   - \`reasoning\`：思考過程（不會出現在 OpenAI 標準回應裡，這是本 gateway 額外傳的）
   呼叫 thinking 模型時 **務必設 \`max_tokens >= 1500\`**，否則 finish_reason='length' + content=''。`);
    }
    if (anyVision) {
        constraints.push(`vision 模型（標記 \`[vision]\`）接受 OpenAI 標準的 multipart content：\`[{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}, {"type":"text","text":"..."}]\`。`);
    }
    if (anyThinking) {
        constraints.push(`**stream 模式對 thinking 模型有已知 bug**：\`delta.content\` 會夾帶原始 harmony tokens（\`<|channel|>analysis<|message|>...<|end|>\` 是 reasoning、\`<|channel|>final<|message|>...\` 才是真正答覆），client 必須自己用 \`<|channel|>final<|message|>\` 切。**建議 thinking 模型一律用 non-stream（\`stream: false\`）**，gateway 會幫你切好放到 \`message.content\`。`);
    } else {
        constraints.push(`stream 模式回 SSE，格式同 OpenAI（\`data: {...}\\n\\n\` ... 最後 \`data: [DONE]\`）。`);
    }
    constraints.push(`部分模型（特別是 \`gpt-oss\` 系列、deepseek 雲端）會自稱「我是 ChatGPT，由 OpenAI 訓練」— 那是訓練資料的副作用，不是真實後端。如果你要對外露出回應，**請在 \`messages\` 開頭塞一個 system prompt 覆寫身份**（見下方範例）。`);
    const constraintsBlock = constraints.map((c, i) => `${i + 1}. ${c}`).join('\n');

    // Python example tuned per primary model — pure stdlib urllib (no install required)
    const maxTokens = primaryMeta.thinking ? 1500 : 512;
    const thinkingFallback = primaryMeta.thinking
        ? `# thinking 模型：content 可能空字串，記得 fallback 看 reasoning
text = msg.get("content") or msg.get("reasoning") or ""`
        : `text = msg.get("content", "")`;
    const SYSTEM_PROMPT = '你是本地端 LLM 助理。請以繁體中文回答；不要自稱 ChatGPT 或 OpenAI。';
    let pyExample;
    if (primaryMeta.vision) {
        pyExample = `import base64, json, urllib.request

with open("image.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

body = json.dumps({
    "model": MODEL,
    "messages": [
        {"role": "system", "content": "${SYSTEM_PROMPT}"},
        {"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
            {"type": "text", "text": "描述這張圖片"},
        ]},
    ],
    "max_tokens": ${maxTokens},
}).encode("utf-8")

req = urllib.request.Request(
    f"{BASE_URL}/chat/completions",
    method="POST",
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    data=body,
)
with urllib.request.urlopen(req, timeout=120) as r:
    data = json.loads(r.read())
msg = data["choices"][0]["message"]
${thinkingFallback}
print(text)`;
    } else {
        pyExample = `import json, urllib.request

body = json.dumps({
    "model": MODEL,
    "messages": [
        {"role": "system", "content": "${SYSTEM_PROMPT}"},
        {"role": "user", "content": "你好"},
    ],
    "max_tokens": ${maxTokens},
}).encode("utf-8")

req = urllib.request.Request(
    f"{BASE_URL}/chat/completions",
    method="POST",
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    data=body,
)
with urllib.request.urlopen(req, timeout=120) as r:
    data = json.loads(r.read())
msg = data["choices"][0]["message"]
${thinkingFallback}
print(text)`;
    }

    return `# 私有 LLM API 存取資訊（OpenAI 相容）

請用以下資訊呼叫 chat completions API 完成接下來的任務。
此 endpoint 完整相容 OpenAI \`/v1/chat/completions\` 規格。

## 連線設定

\`\`\`python
BASE_URL = "${baseUrl}/v1"
API_KEY  = "${apiKey}"
MODEL    = "${primary}"
\`\`\`

## 可用模型${isSingleModel ? '（這把 Key 唯一能用的 model）' : '（這把 Key 允許的所有 model）'}

${modelLines}

## 重要限制（請務必遵守）

${constraintsBlock}

## Python 範例（純標準庫 urllib，**不必裝任何套件**）

\`\`\`python
${pyExample}
\`\`\`

> 若已裝 \`openai\` SDK 也可用：\`OpenAI(base_url=BASE_URL, api_key=API_KEY).chat.completions.create(model=MODEL, messages=[...], max_tokens=${maxTokens})\`，response 是同樣的結構。
> 不建議用 \`curl\` 直接打：在 PowerShell / cmd.exe 下，\`curl\` 是 \`Invoke-WebRequest\` 別名，會把 JSON 內的雙引號吃掉。請優先用 Python。
`;
}

// Edit API Key (description / is_admin / is_active)
let keyEditingId = null;

function editApiKey(keyId) {
    const key = apiKeysCache.find(k => k.id === keyId);
    if (!key) {
        alert('找不到該 API Key，請重新整理');
        return;
    }
    keyEditingId = key.id;
    document.getElementById('key-edit-username').textContent = key.username;
    document.getElementById('key-edit-description').value = key.description || '';
    document.getElementById('key-edit-admin').checked = !!key.is_admin;
    document.getElementById('key-edit-active').checked = !!key.is_active;
    const editor = document.getElementById('key-editor');
    editor.style.display = 'block';
    editor.scrollIntoView({ behavior: 'smooth' });
}

function closeKeyEditor() {
    document.getElementById('key-editor').style.display = 'none';
    keyEditingId = null;
}

async function saveApiKey() {
    if (!keyEditingId) return;

    const body = {
        description: document.getElementById('key-edit-description').value.trim(),
        is_admin: document.getElementById('key-edit-admin').checked,
        is_active: document.getElementById('key-edit-active').checked
    };

    try {
        const response = await authFetch(`${API_URL}/api/keys/${keyEditingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || '儲存失敗');

        alert('API Key 已更新');
        closeKeyEditor();
        loadApiKeys();
    } catch (error) {
        alert('儲存失敗: ' + error.message);
    }
}

// Toggle key active status
async function toggleKeyStatus(keyId, newStatus) {
    try {
        const response = await authFetch(`${API_URL}/api/keys/${keyId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: newStatus })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || '操作失敗');
        }

        loadApiKeys();
    } catch (error) {
        alert('操作失敗: ' + error.message);
    }
}

// Regenerate API Key
async function regenerateKey(keyId, username) {
    if (!confirm(`確定要重新產生「${username}」的 API Key 嗎？\n舊的 Key 將立即失效。`)) {
        return;
    }

    try {
        const response = await authFetch(`${API_URL}/api/keys/${keyId}/regenerate`, {
            method: 'POST'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || '重新產生失敗');
        }

        // Show the new key
        document.getElementById('new-key-value').textContent = data.api_key;
        document.getElementById('new-key-result').style.display = 'block';
        document.getElementById('new-key-result').querySelector('h3').textContent = 'API Key 已重新產生！';

        loadApiKeys();
    } catch (error) {
        alert('重新產生 API Key 失敗: ' + error.message);
    }
}

// Delete API Key
async function deleteApiKey(keyId, username) {
    if (!confirm(`確定要刪除「${username}」的 API Key 嗎？\n此操作無法復原。`)) {
        return;
    }

    try {
        const response = await authFetch(`${API_URL}/api/keys/${keyId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || '刪除失敗');
        }

        loadApiKeys();
    } catch (error) {
        alert('刪除失敗: ' + error.message);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});
