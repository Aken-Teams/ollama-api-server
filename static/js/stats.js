// ==========================================================================
// STATS MODULE
// ==========================================================================

function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
}

async function loadStats() {
    try {
        const response = await authFetch(`${API_URL}/api/stats`);
        const data = await response.json();
        const s = data.summary;

        // 更新摘要卡片
        document.getElementById('stat-total-requests').textContent = formatNum(s.total_requests);
        document.getElementById('stat-success-rate').textContent = s.success_rate + '%';
        document.getElementById('stat-avg-response').textContent = s.avg_response_time_ms.toFixed(0) + ' ms';
        document.getElementById('stat-total-tokens').textContent = formatNum(s.total_tokens);

        // 更新 Token 明細
        var el;
        el = document.getElementById('stat-prompt-tokens');
        if (el) el.textContent = formatNum(s.total_tokens_prompt);
        el = document.getElementById('stat-completion-tokens');
        if (el) el.textContent = formatNum(s.total_tokens_completion);
        el = document.getElementById('stat-errors');
        if (el) el.textContent = s.errors_count.toLocaleString();

        // 成功率環形圖
        renderDonutChart('success-rate-chart', s.success_rate);

        // 每日趨勢長條圖 (SVG)
        renderDailyBarChart('daily-chart', data.by_date);

        // 模型使用分布（水平長條圖）
        renderModelChart('model-usage-chart', data.by_model);

        // Token 分布圓餅圖
        renderTokenPieChart('token-pie-chart', s.total_tokens_prompt, s.total_tokens_completion);

    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// 環形圖（成功率）
function renderDonutChart(containerId, rate) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const r = 40, cx = 50, cy = 50, stroke = 8;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - rate / 100);
    const color = rate >= 99 ? '#10b981' : rate >= 95 ? '#f59e0b' : '#ef4444';

    container.innerHTML = `
        <svg viewBox="0 0 100 100" style="width: 100%; max-width: 120px;">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f3f4f6" stroke-width="${stroke}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
                style="transition: stroke-dashoffset 0.8s ease;"/>
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="16" font-weight="700" fill="#333">${rate}%</text>
            <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="7" fill="#999">成功率</text>
        </svg>`;
}

// 每日趨勢長條圖 (SVG)
function renderDailyBarChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const entries = Object.entries(data);
    if (entries.length === 0) { container.innerHTML = '<p style="color:#999;font-size:13px;">暫無數據</p>'; return; }

    const maxVal = Math.max(...entries.map(([, v]) => v), 1);
    const w = 600, h = 200, pad = 30, barGap = 2;
    const barW = Math.max(4, (w - pad * 2) / entries.length - barGap);
    const chartH = h - pad - 10;

    let bars = '', labels = '';
    entries.forEach(([label, value], i) => {
        const barH = (value / maxVal) * chartH;
        const x = pad + i * (barW + barGap);
        const y = h - pad - barH;
        bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="#f59e0b" opacity="0.85">
            <title>${label}: ${value.toLocaleString()} 次</title></rect>`;
        // 只顯示部分日期標籤
        if (i % Math.ceil(entries.length / 6) === 0) {
            const shortLabel = label.slice(5); // MM-DD
            labels += `<text x="${x + barW / 2}" y="${h - 5}" text-anchor="middle" font-size="9" fill="#999">${shortLabel}</text>`;
        }
    });

    // Y 軸刻度
    let yAxis = '';
    for (let i = 0; i <= 4; i++) {
        const yVal = Math.round(maxVal * i / 4);
        const yPos = h - pad - (i / 4) * chartH;
        yAxis += `<line x1="${pad - 5}" y1="${yPos}" x2="${w - 5}" y2="${yPos}" stroke="#f3f4f6" stroke-width="1"/>`;
        yAxis += `<text x="${pad - 8}" y="${yPos + 3}" text-anchor="end" font-size="9" fill="#999">${formatNum(yVal)}</text>`;
    }

    container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;">${yAxis}${bars}${labels}</svg>`;
}

// 模型使用水平長條圖
function renderModelChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const entries = Object.entries(data).slice(0, 8); // Top 8
    if (entries.length === 0) { container.innerHTML = '<p style="color:#999;font-size:13px;">暫無數據</p>'; return; }

    const maxVal = Math.max(...entries.map(([, v]) => v), 1);
    const colors = ['#f59e0b', '#fb923c', '#fbbf24', '#f97316', '#fdba74', '#fcd34d', '#ea580c', '#fed7aa'];

    container.innerHTML = entries.map(([model, count], i) => {
        const pct = (count / maxVal) * 100;
        const shortName = model.length > 20 ? model.slice(0, 18) + '...' : model;
        return `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;" title="${model}: ${count.toLocaleString()}">
                <span style="font-size:12px;color:#666;width:120px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">${shortName}</span>
                <div style="flex:1;height:18px;background:#f3f4f6;border-radius:9px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${colors[i % colors.length]};border-radius:9px;transition:width 0.6s ease;"></div>
                </div>
                <span style="font-size:11px;color:#999;width:50px;flex-shrink:0;">${formatNum(count)}</span>
            </div>`;
    }).join('');
}

// Token 分布圓餅圖
function renderTokenPieChart(containerId, prompt, completion) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const total = prompt + completion;
    if (total === 0) { container.innerHTML = '<p style="color:#999;font-size:13px;">暫無數據</p>'; return; }

    const promptPct = prompt / total;
    const r = 40, cx = 50, cy = 50;

    // SVG arc for prompt portion
    const angle = promptPct * 360;
    const rad = (angle - 90) * Math.PI / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    const largeArc = angle > 180 ? 1 : 0;

    const promptPath = angle >= 360 ? `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r}` :
        `M ${cx},${cy - r} A ${r},${r} 0 ${largeArc},1 ${x},${y} L ${cx},${cy} Z`;
    const compPath = angle <= 0 ? `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r}` :
        `M ${x},${y} A ${r},${r} 0 ${1 - largeArc},1 ${cx},${cy - r} L ${cx},${cy} Z`;

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:20px;">
            <svg viewBox="0 0 100 100" style="width:100px;height:100px;flex-shrink:0;">
                <path d="${promptPath}" fill="#f59e0b"/>
                <path d="${compPath}" fill="#fcd34d"/>
                <circle cx="${cx}" cy="${cy}" r="22" fill="white"/>
            </svg>
            <div style="font-size:13px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>
                    Prompt <strong style="margin-left:auto;">${formatNum(prompt)}</strong>
                    <span style="color:#999;font-size:11px;">(${(promptPct * 100).toFixed(1)}%)</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="width:10px;height:10px;border-radius:50%;background:#fcd34d;display:inline-block;"></span>
                    Completion <strong style="margin-left:auto;">${formatNum(completion)}</strong>
                    <span style="color:#999;font-size:11px;">(${((1 - promptPct) * 100).toFixed(1)}%)</span>
                </div>
            </div>
        </div>`;
}

// 重置統計
async function resetStats() {
    if (!confirm('確定要重置所有統計數據嗎？此操作無法復原。')) return;

    try {
        await authFetch(`${API_URL}/api/stats`, { method: 'DELETE' });
        loadStats();
    } catch (error) {
        alert('重置失敗: ' + error.message);
    }
}

// 載入對話紀錄
async function loadConversations(page = 0) {
    // 檢查對話紀錄 UI 是否存在（已被隱藏則跳過）
    const historyTotal = document.getElementById('history-total');
    const listContainer = document.getElementById('conversation-list');
    if (!historyTotal || !listContainer) {
        return; // UI 不存在，跳過載入
    }

    currentPage = page;
    const offset = page * pageSize;

    try {
        const response = await authFetch(`${API_URL}/api/conversations?limit=${pageSize}&offset=${offset}`);
        const data = await response.json();

        historyTotal.textContent = data.total;

        const paginationEl = document.getElementById('pagination');
        if (data.conversations.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">暫無對話紀錄</p>';
            if (paginationEl) paginationEl.innerHTML = '';
            return;
        }

        listContainer.innerHTML = data.conversations.map(conv => {
            const timestamp = new Date(conv.timestamp).toLocaleString('zh-TW');
            const userMessages = conv.messages.filter(m => m.role === 'user');
            const lastUserMessage = userMessages.length > 0 ?
                userMessages[userMessages.length - 1].content : '';

            return `
                <div class="conversation-item ${conv.success ? '' : 'error'}">
                    <div class="conversation-header">
                        <div class="conversation-meta">
                            <span class="conversation-model">${conv.model}</span>
                            <span>${timestamp}</span>
                            <span>${conv.response_time_ms}ms</span>
                            <span>${conv.total_tokens} tokens</span>
                            ${!conv.success ? '<span style="color: #dc3545;">失敗</span>' : ''}
                        </div>
                    </div>
                    <div class="conversation-body">
                        ${conv.messages.map(msg => `
                            <div class="message-block">
                                <div class="message-role">${msg.role}</div>
                                <div class="message-content">${escapeHtml(msg.content)}</div>
                            </div>
                        `).join('')}
                        <div class="message-block response-block">
                            <div class="message-role">Assistant</div>
                            <div class="message-content">${escapeHtml(conv.response)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 分頁
        renderPagination(data.total, page);

    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

// 渲染分頁
function renderPagination(total, currentPage) {
    const totalPages = Math.ceil(total / pageSize);
    const pagination = document.getElementById('pagination');

    if (!pagination) return; // UI 不存在，跳過

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    html += `<button ${currentPage === 0 ? 'disabled' : ''} onclick="loadConversations(${currentPage - 1})">上一頁</button>`;

    for (let i = 0; i < totalPages && i < 5; i++) {
        const pageNum = currentPage < 3 ? i : currentPage - 2 + i;
        if (pageNum >= totalPages) break;
        html += `<button class="${pageNum === currentPage ? 'active' : ''}" onclick="loadConversations(${pageNum})">${pageNum + 1}</button>`;
    }

    html += `<button ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="loadConversations(${currentPage + 1})">下一頁</button>`;

    pagination.innerHTML = html;
}

// 清除對話紀錄
async function clearConversations() {
    if (!confirm('確定要清除所有對話紀錄嗎？此操作無法復原。')) return;

    try {
        await authFetch(`${API_URL}/api/conversations`, { method: 'DELETE' });
        loadConversations();
    } catch (error) {
        alert('清除失敗: ' + error.message);
    }
}

// HTML 轉義