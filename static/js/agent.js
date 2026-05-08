// ==========================================================================
// AGENT 對話 — 用 model="auto" 走 backend LLM router
// ==========================================================================

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
        // 把所有對話歷史一起送，router 拿最後一條 user 訊息分類
        const history = _agentMessages
            .filter(m => !m.thinking)
            .map(m => ({ role: m.role, content: m.content }));

        const resp = await authFetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'auto',
                messages: history,
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
