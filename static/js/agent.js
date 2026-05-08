// ==========================================================================
// AGENT 對話 — 用 model="auto" 走 backend LLM router
// ==========================================================================

const _AGENT_SYSTEM_PROMPT =
    '你是一個繁體中文助理。請務必使用繁體中文（台灣慣用語）回答，' +
    '不要使用簡體中文。技術名詞、程式碼、英文專有名詞可以保留原文。';

const _agentMessages = [];

function _agentRender() {
    const box = document.getElementById('agent-chat-box');
    if (!box) return;
    if (_agentMessages.length === 0) {
        box.innerHTML = '<div class="agent-empty">輸入訊息開始對話 — Router 會自動挑模型</div>';
        return;
    }
    box.innerHTML = _agentMessages.map(m => {
        const role = m.role === 'user' ? 'USER' : 'AGENT';
        const meta = [];
        if (m.route) meta.push(`<span class="agent-route-pill" data-route="${m.route}">${m.route}</span>`);
        if (m.model) meta.push(`<span>${m.model}</span>`);
        if (m.elapsed != null) meta.push(`<span>${(m.elapsed/1000).toFixed(2)}s</span>`);
        if (m.tokens != null) meta.push(`<span>${m.tokens} tokens</span>`);
        if (m.reasoning) meta.push(`<span title="${(m.reasoning||'').replace(/"/g,'&quot;')}">+ 推理過程 (hover 可看)</span>`);
        const safe = (m.content || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
        const bubble = m.thinking
            ? `<div class="agent-msg-bubble agent-thinking">思考中…</div>`
            : `<div class="agent-msg-bubble">${safe || '<span class="agent-thinking">（空回應）</span>'}${meta.length ? `<div class="agent-msg-meta">${meta.join('')}</div>` : ''}</div>`;
        return `<div class="agent-msg ${m.role}"><div class="agent-msg-role">${role}</div>${bubble}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendAgentMessage() {
    const input = document.getElementById('agent-input');
    const btn = document.getElementById('agent-send-btn');
    const text = (input.value || '').trim();
    if (!text) return;

    _agentMessages.push({ role: 'user', content: text });
    const placeholder = { role: 'assistant', content: '', thinking: true };
    _agentMessages.push(placeholder);
    input.value = '';
    btn.disabled = true;
    btn.textContent = '處理中…';
    _agentRender();

    const start = Date.now();
    try {
        // 把所有對話歷史一起送，router 拿最後一條 user 訊息分類；
        // 在最前面塞 system prompt 強制繁體中文回應。
        const history = _agentMessages
            .filter(m => !m.thinking)
            .map(m => ({ role: m.role, content: m.content }));

        const resp = await authFetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'auto',
                messages: [
                    { role: 'system', content: _AGENT_SYSTEM_PROMPT },
                    ...history,
                ],
                max_tokens: 1024,
                stream: false,
            }),
        });

        const elapsed = Date.now() - start;

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const data = await resp.json();
        const route = resp.headers.get('x-agent-route') || data.agent_route || null;
        const msg = data.choices?.[0]?.message || {};
        const content = msg.content || '';
        const reasoning = msg.reasoning_content || '';
        const tokens = data.usage?.completion_tokens ?? null;
        const model = data.model || null;

        // 取代 placeholder
        const last = _agentMessages[_agentMessages.length - 1];
        last.thinking = false;
        last.content = content || '(模型未產生 content — 可能是 reasoning 被截斷，max_tokens 不足)';
        last.route = route;
        last.model = model;
        last.elapsed = elapsed;
        last.tokens = tokens;
        last.reasoning = reasoning;
    } catch (err) {
        const last = _agentMessages[_agentMessages.length - 1];
        last.thinking = false;
        last.content = `錯誤：${err.message || err}`;
    } finally {
        btn.disabled = false;
        btn.textContent = '送出';
        _agentRender();
        input.focus();
    }
}

// 給外部 AI 編輯器（Claude Code / Cursor / Copilot）的完整 prompt
function copyAgentApiPrompt() {
    const baseUrl = (typeof EXTERNAL_URL !== 'undefined' && EXTERNAL_URL) ? EXTERNAL_URL : window.location.origin;
    const apiKey = (typeof currentApiKey !== 'undefined' && currentApiKey) ? currentApiKey : 'YOUR_API_KEY';

    if (apiKey === 'pj-admin-zhpjaiaoi-2024') {
        alert('你目前用的是系統預設金鑰，請登出後用個人帳號登入以拿到專屬 API Key。');
        return;
    }

    const text = `# 任務：把這個 Agent（自動挑模型）端點接到我目前的專案

## 連線資訊
- **Base URL**：\`${baseUrl}\`
- **API Key**：\`${apiKey}\`（請存到環境變數 \`OPENAI_API_KEY\`，不要寫死）
- **協定**：OpenAI 相容（任何支援 OpenAI Chat Completions 的 SDK 都能直接用）
- **特殊模型 ID**：\`model: "auto"\` — 後端會用一個小型分類器（Qwen2.5-1.5B）判斷需求，
  自動轉發到最適合的模型。也接受 \`model: "agent"\` 當別名。

## Routing 規則（後端自動判斷）
| 類別 | 觸發條件（大致） | 實際走的模型 |
|---|---|---|
| code | 程式、debug、code review | gpt-oss 120B (MLX) |
| reasoning | 數學、邏輯、step-by-step | gpt-oss 120B (MLX) |
| vision | 訊息含 image_url | Qwen2.5-VL 7B (MLX) |
| quick | 短訊息 / 打招呼 | Qwen2.5 1.5B (MLX) |
| general | 其他（寫作、知識、閒聊） | Gemma 3 27B (MLX) |

## 回應格式（重要）
標準 OpenAI \`chat.completion\` 物件，**多兩個欄位**：

- HTTP header \`x-agent-route\`：實際走的類別字串（"code" / "general" 等）
- JSON body \`agent_route\`：同上，方便沒讀 header 的 client
- \`message.reasoning_content\`：當路由到 gpt-oss 等 reasoning 模型時，
  推理過程會放這裡，最終答案在 \`message.content\`。要分開呈現給使用者。
- \`model\`：實際被路由到的模型 ID（不是 "auto"）

## 你的工作
請依我目前專案的語言/框架（自行偵測 package.json / requirements.txt / go.mod 等），加入：

1. 一個 API client（讀環境變數 \`OPENAI_API_KEY\` 跟 \`OPENAI_BASE_URL\`）
2. \`agent_chat(prompt: str, *, history=None, stream=False)\` 函式（Python）或對應語言版本
3. 回傳要包含：\`content\`、\`route\`（從 header 或 body 取）、\`model\`、\`reasoning\`（可選）
4. 如果是 reasoning 模型且 \`content\` 為空（max_tokens 截斷），要在 UI 顯示 "推理被截斷，請增加 max_tokens"
5. 錯誤處理：401 → key 失效；429 → backoff；5xx → 重試一次
6. README 加一段「環境變數設定」說明

## 參考片段

### Python（requests）
\`\`\`python
import os, requests

def agent_chat(prompt, history=None, max_tokens=1024):
    msgs = (history or []) + [{"role": "user", "content": prompt}]
    r = requests.post(
        f"{os.environ['OPENAI_BASE_URL']}/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={"model": "auto", "messages": msgs, "max_tokens": max_tokens, "stream": False},
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    msg = data["choices"][0]["message"]
    return {
        "content": msg.get("content", ""),
        "reasoning": msg.get("reasoning_content"),
        "route": r.headers.get("x-agent-route") or data.get("agent_route"),
        "model": data.get("model"),
    }
\`\`\`

### Python（OpenAI SDK）
\`\`\`python
from openai import OpenAI
client = OpenAI(base_url=os.environ["OPENAI_BASE_URL"] + "/v1",
                api_key=os.environ["OPENAI_API_KEY"])
resp = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "幫我寫一個 fib 函式"}],
)
# 注意：標準 OpenAI SDK 會把 agent_route 當 extra field 忽略；要拿就直接用 requests。
print(resp.choices[0].message.content)
\`\`\`

### Node / TypeScript（fetch）
\`\`\`ts
async function agentChat(prompt: string, history: any[] = []) {
  const r = await fetch(\`\${process.env.OPENAI_BASE_URL}/v1/chat/completions\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${process.env.OPENAI_API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "auto",
      messages: [...history, { role: "user", content: prompt }],
      max_tokens: 1024,
    }),
  });
  if (!r.ok) throw new Error(\`HTTP \${r.status}: \${await r.text()}\`);
  const data = await r.json();
  return {
    content: data.choices[0].message.content,
    reasoning: data.choices[0].message.reasoning_content ?? null,
    route: r.headers.get("x-agent-route") ?? data.agent_route ?? null,
    model: data.model,
  };
}
\`\`\`

### cURL（最小範例）
\`\`\`bash
curl -X POST ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{"role":"user","content":"用一句話介紹台灣的玉山"}],
    "max_tokens": 200
  }' -i
# 看 \`x-agent-route\` header + body \`agent_route\` 兩個值會一致
\`\`\`

## 額外建議
- 想強制繁體中文輸出，前面塞一個 system 訊息：
  \`{"role":"system","content":"請使用繁體中文回答（台灣慣用語）"}\`
- 想知道用了多少 token 看 \`usage.completion_tokens\`
- 想跳過 router 直接指定模型，把 \`model: "auto"\` 換成具體 model id（呼叫 \`/v1/models\` 看清單）
- 串流模式 (\`stream: true\`) 目前 agent route 也會運作，但 \`agent_route\` 不會出現在
  delta chunks，請改讀 HTTP header 或最後一個 chunk

請依以上規格在我的專案中實作。完成後請示範一個跑得起來的測試請求。`;

    navigator.clipboard.writeText(text).then(() => {
        alert('Agent API 提示詞已複製。貼到 Claude Code / Cursor / Copilot Chat 即可。');
    }).catch(err => {
        alert('複製失敗：' + err.message);
    });
}

function clearAgentChat() {
    if (_agentMessages.length === 0) return;
    if (!confirm('清空目前對話？')) return;
    _agentMessages.length = 0;
    _agentRender();
}

// 初始化空狀態
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('agent-chat-box')) _agentRender();
});
