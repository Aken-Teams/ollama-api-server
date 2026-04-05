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
        if (el) el.textContent = s.errors_count > 0 ? s.errors_count + ' 錯誤' : '';
        // 下方 Token 分布明細
        el = document.getElementById('stat-prompt-tokens-detail');
        if (el) el.textContent = formatNum(s.total_tokens_prompt);
        el = document.getElementById('stat-completion-tokens-detail');
        if (el) el.textContent = formatNum(s.total_tokens_completion);
        el = document.getElementById('stat-errors-detail');
        if (el) el.textContent = s.errors_count.toLocaleString();

        // 成功率
        renderDonutChart('success-rate-chart', s.success_rate);
        const inlineRate = document.getElementById('stat-success-rate-inline');
        if (inlineRate) {
            const color = s.success_rate >= 99 ? '#10b981' : s.success_rate >= 95 ? '#f59e0b' : '#ef4444';
            inlineRate.textContent = s.success_rate + '%';
            inlineRate.style.color = color;
        }

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
        <svg viewBox="0 0 100 100" style="width: 100%; max-width: 80px;">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f3f4f6" stroke-width="${stroke}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
                style="transition: stroke-dashoffset 0.8s ease;"/>
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="16" font-weight="700" fill="#333">${rate}%</text>
            <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="7" fill="#999">成功率</text>
        </svg>`;
}

// 每日趨勢長條圖 (SVG) — 固定顯示近 30 天，自適應高度 + tooltip
function renderDailyBarChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 產生近 30 天的完整日期列表
    const days = 30;
    const allDates = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
        allDates.push([key, data[key] || 0]);
    }

    const maxVal = Math.max(...allDates.map(([, v]) => v), 1);
    const w = 600, h = 240, padLeft = 30, padBottom = 20, padTop = 5;
    const barGap = 2;
    const barW = (w - padLeft - 10) / days - barGap;
    const chartH = h - padBottom - padTop;

    // 透明的 hover 區域 + 實際的 bar
    let bars = '';
    let labels = '';
    allDates.forEach(([label, value], i) => {
        const barH = (value / maxVal) * chartH;
        const x = padLeft + i * (barW + barGap);
        const y = h - padBottom - barH;
        const opacity = value > 0 ? '0.85' : '0.15';
        // 實際長條
        bars += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, value > 0 ? 2 : 1)}" rx="1.5" fill="#f59e0b" opacity="${opacity}" class="chart-bar-rect" data-date="${label}" data-value="${value}"/>`;
        // 透明 hover 區（整欄高度，方便觸發 tooltip）
        bars += `<rect x="${x}" y="${padTop}" width="${barW}" height="${chartH}" fill="transparent" class="chart-bar-hover" data-date="${label}" data-value="${value}" data-bx="${x}" data-by="${y}"/>`;
        // 每 5 天顯示日期標籤
        if (i % 5 === 0 || i === days - 1) {
            const shortLabel = label.slice(5); // MM-DD
            labels += `<text x="${x + barW / 2}" y="${h - 4}" text-anchor="middle" font-size="8" fill="#bbb">${shortLabel}</text>`;
        }
    });

    // Y 軸刻度
    let yAxis = '';
    for (let i = 0; i <= 4; i++) {
        const yVal = Math.round(maxVal * i / 4);
        const yPos = h - padBottom - (i / 4) * chartH;
        yAxis += `<line x1="${padLeft - 5}" y1="${yPos}" x2="${w - 5}" y2="${yPos}" stroke="#f3f4f6" stroke-width="1"/>`;
        yAxis += `<text x="${padLeft - 8}" y="${yPos + 3}" text-anchor="end" font-size="8" fill="#bbb">${formatNum(yVal)}</text>`;
    }

    container.innerHTML = `
        <div style="position:relative;width:100%;height:100%;">
            <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">${yAxis}${bars}${labels}</svg>
            <div id="chart-tooltip" style="display:none;position:absolute;pointer-events:none;background:#333;color:#fff;font-size:12px;padding:4px 10px;border-radius:6px;white-space:nowrap;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.15);"></div>
        </div>`;

    // Tooltip 事件
    const tooltip = container.querySelector('#chart-tooltip');
    const svg = container.querySelector('svg');
    container.querySelectorAll('.chart-bar-hover').forEach(rect => {
        rect.addEventListener('mouseenter', (e) => {
            const date = rect.getAttribute('data-date');
            const value = parseInt(rect.getAttribute('data-value'));
            tooltip.textContent = date + '：' + value.toLocaleString() + ' 次';
            tooltip.style.display = 'block';
            // 高亮對應 bar
            const bars = container.querySelectorAll(`.chart-bar-rect[data-date="${date}"]`);
            bars.forEach(b => { b.setAttribute('opacity', '1'); b.setAttribute('fill', '#e88e00'); });
        });
        rect.addEventListener('mousemove', (e) => {
            const containerRect = container.getBoundingClientRect();
            let left = e.clientX - containerRect.left + 10;
            let top = e.clientY - containerRect.top - 30;
            // 避免超出右側
            if (left + 120 > containerRect.width) left = left - 130;
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });
        rect.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            const date = rect.getAttribute('data-date');
            const value = parseInt(rect.getAttribute('data-value'));
            const opacity = value > 0 ? '0.85' : '0.15';
            const bars = container.querySelectorAll(`.chart-bar-rect[data-date="${date}"]`);
            bars.forEach(b => { b.setAttribute('opacity', opacity); b.setAttribute('fill', '#f59e0b'); });
        });
    });
}

// 模型使用水平長條圖
function renderModelChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const entries = Object.entries(data).slice(0, 8); // Top 8
    if (entries.length === 0) { container.innerHTML = '<p style="color:#999;font-size:13px;">暫無數據</p>'; return; }

    const total = entries.reduce((s, [, v]) => s + v, 0);
    const maxVal = Math.max(...entries.map(([, v]) => v), 1);
    const colors = ['#f59e0b', '#fb923c', '#fbbf24', '#f97316', '#fdba74', '#fcd34d', '#ea580c', '#fed7aa'];

    container.innerHTML = `<div style="position:relative;">` + entries.map(([model, count], i) => {
        const pct = (count / maxVal) * 100;
        const pctTotal = ((count / total) * 100).toFixed(1);
        const shortName = model.length > 20 ? model.slice(0, 18) + '...' : model;
        return `
            <div class="model-bar-row" data-model="${model}" data-count="${count}" data-pct="${pctTotal}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:default;">
                <span style="font-size:12px;color:#666;width:120px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">${shortName}</span>
                <div style="flex:1;height:18px;background:#f3f4f6;border-radius:9px;overflow:hidden;">
                    <div class="model-bar-fill" style="height:100%;width:${pct}%;background:${colors[i % colors.length]};border-radius:9px;transition:width 0.6s ease;"></div>
                </div>
                <span style="font-size:11px;color:#999;width:50px;flex-shrink:0;">${formatNum(count)}</span>
            </div>`;
    }).join('') + `<div class="chart-tip" style="display:none;position:absolute;pointer-events:none;background:#333;color:#fff;font-size:12px;padding:4px 10px;border-radius:6px;white-space:nowrap;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.15);"></div></div>`;

    // Tooltip
    const tip = container.querySelector('.chart-tip');
    container.querySelectorAll('.model-bar-row').forEach(row => {
        row.addEventListener('mouseenter', () => {
            tip.textContent = row.dataset.model + '：' + parseInt(row.dataset.count).toLocaleString() + ' 次（' + row.dataset.pct + '%）';
            tip.style.display = 'block';
            row.querySelector('.model-bar-fill').style.filter = 'brightness(0.85)';
        });
        row.addEventListener('mousemove', (e) => {
            const cr = container.getBoundingClientRect();
            let left = e.clientX - cr.left + 12;
            if (left + 160 > cr.clientWidth) left = left - 180;
            tip.style.left = left + 'px';
            tip.style.top = (e.clientY - cr.top - 28) + 'px';
        });
        row.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
            row.querySelector('.model-bar-fill').style.filter = '';
        });
    });
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

    const promptNum = prompt.toLocaleString();
    const compNum = completion.toLocaleString();
    const totalNum = total.toLocaleString();

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;overflow:hidden;position:relative;">
            <svg viewBox="0 0 100 100" style="width:90px;min-width:90px;height:90px;">
                <path d="${promptPath}" fill="#f59e0b" class="pie-slice" data-tip="Prompt：${promptNum} tokens（${(promptPct * 100).toFixed(1)}%）" style="cursor:default;"/>
                <path d="${compPath}" fill="#fcd34d" class="pie-slice" data-tip="Completion：${compNum} tokens（${((1 - promptPct) * 100).toFixed(1)}%）" style="cursor:default;"/>
                <circle cx="${cx}" cy="${cy}" r="22" fill="white" style="pointer-events:none;"/>
            </svg>
            <div style="font-size:12px;min-width:0;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></span>
                    <span style="color:#666;">Prompt</span>
                    <strong>${formatNum(prompt)}</strong>
                    <span style="color:#999;font-size:10px;">(${(promptPct * 100).toFixed(1)}%)</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#fcd34d;flex-shrink:0;"></span>
                    <span style="color:#666;">Comp.</span>
                    <strong>${formatNum(completion)}</strong>
                    <span style="color:#999;font-size:10px;">(${((1 - promptPct) * 100).toFixed(1)}%)</span>
                </div>
                <div style="margin-top:4px;font-size:10px;color:#bbb;">共 ${formatNum(total)} tokens</div>
            </div>
            <div class="pie-tip" style="display:none;position:absolute;pointer-events:none;background:#333;color:#fff;font-size:12px;padding:4px 10px;border-radius:6px;white-space:nowrap;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.15);"></div>
        </div>`;

    // Tooltip for pie slices
    const tip = container.querySelector('.pie-tip');
    container.querySelectorAll('.pie-slice').forEach(slice => {
        slice.addEventListener('mouseenter', () => {
            tip.textContent = slice.dataset.tip;
            tip.style.display = 'block';
            slice.style.opacity = '0.75';
        });
        slice.addEventListener('mousemove', (e) => {
            const cr = container.getBoundingClientRect();
            tip.style.left = (e.clientX - cr.left + 12) + 'px';
            tip.style.top = (e.clientY - cr.top - 28) + 'px';
        });
        slice.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
            slice.style.opacity = '';
        });
    });
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