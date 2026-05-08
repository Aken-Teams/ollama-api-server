// ==========================================================================
// USAGE LOGS MODULE
// ==========================================================================

let usageOffset = 0;
const USAGE_PAGE_SIZE = 50;

async function loadUsageLogs(resetOffset = true) {
    if (resetOffset) usageOffset = 0;

    const username = document.getElementById('usage-filter-username').value.trim();
    const endpoint = document.getElementById('usage-filter-endpoint').value.trim();
    const status = document.getElementById('usage-filter-status').value;
    const days = document.getElementById('usage-filter-days').value;

    const params = new URLSearchParams();
    if (username) params.set('username', username);
    if (endpoint) params.set('endpoint', endpoint);
    if (status) params.set('status', status);
    if (days) {
        const start = new Date();
        start.setDate(start.getDate() - parseInt(days));
        params.set('start_date', start.toISOString().slice(0, 19).replace('T', ' '));
    }
    params.set('limit', USAGE_PAGE_SIZE);
    params.set('offset', usageOffset);

    const container = document.getElementById('usage-logs-list');
    const pager = document.getElementById('usage-logs-pager');
    container.innerHTML = '<p style="color: #999;">載入中...</p>';
    pager.innerHTML = '';

    try {
        const res = await authFetch(`${API_URL}/api/usage?${params.toString()}`);
        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json()).detail || ''; } catch {}
            throw new Error(`無法載入使用紀錄 (HTTP ${res.status}${detail ? ': ' + detail : ''})`);
        }
        const data = await res.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            container.innerHTML = '<p style="color: #999;">查無紀錄</p>';
            return;
        }

        container.innerHTML = `
            <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8f9fa; text-align: left;">
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">時間</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">使用者</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">端點</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">模型</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">Token</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">耗時</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">狀態</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">IP</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(l => {
                        const ok = l.status_code < 400;
                        const time = l.request_at ? new Date(l.request_at).toLocaleString('zh-TW') : '-';
                        const tokens = (l.total_tokens || (l.prompt_tokens + l.completion_tokens) || 0);
                        return `
                        <tr style="border-bottom: 1px solid #eee;" title="${l.error_message ? escapeHtml(l.error_message) : ''}">
                            <td style="padding: 8px; white-space: nowrap; color: #666;">${time}</td>
                            <td style="padding: 8px;"><strong>${escapeHtml(l.username || '-')}</strong></td>
                            <td style="padding: 8px; font-family: monospace; color: #555;">${l.method} ${escapeHtml(l.endpoint)}</td>
                            <td style="padding: 8px;">${escapeHtml(l.model || '-')}</td>
                            <td style="padding: 8px; text-align: right;">${tokens > 0 ? tokens.toLocaleString() : '-'}</td>
                            <td style="padding: 8px; text-align: right; color: #666;">${l.response_time_ms} ms</td>
                            <td style="padding: 8px;">
                                <span style="color: ${ok ? '#28a745' : '#dc3545'}; font-weight: 600;">${l.status_code}</span>
                            </td>
                            <td style="padding: 8px; font-family: monospace; color: #999;">${escapeHtml(l.ip_address || '-')}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            </div>
        `;

        const total = data.total || 0;
        const start = usageOffset + 1;
        const end = Math.min(usageOffset + logs.length, total);
        pager.innerHTML = `
            <span style="color: #666;">顯示 ${start}-${end} / 共 ${total.toLocaleString()} 筆</span>
            <span>
                <button class="btn" style="padding: 6px 12px; font-size: 13px;" onclick="usagePrevPage()" ${usageOffset === 0 ? 'disabled' : ''}>← 上一頁</button>
                <button class="btn" style="padding: 6px 12px; font-size: 13px; margin-left: 6px;" onclick="usageNextPage()" ${end >= total ? 'disabled' : ''}>下一頁 →</button>
            </span>
        `;
    } catch (e) {
        container.innerHTML = `<p style="color: #dc3545;">載入失敗: ${e.message}</p>`;
    }
}

function usagePrevPage() {
    usageOffset = Math.max(0, usageOffset - USAGE_PAGE_SIZE);
    loadUsageLogs(false);
}

function usageNextPage() {
    usageOffset += USAGE_PAGE_SIZE;
    loadUsageLogs(false);
}

async function loadUsageSummary() {
    const days = document.getElementById('usage-summary-days').value;
    const container = document.getElementById('usage-summary-list');
    container.innerHTML = '<p style="color: #999;">載入中...</p>';

    try {
        const res = await authFetch(`${API_URL}/api/usage/summary?days=${days}`);
        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json()).detail || ''; } catch {}
            throw new Error(`無法載入統計 (HTTP ${res.status}${detail ? ': ' + detail : ''})`);
        }
        const data = await res.json();
        const users = data.per_user || [];

        const retentionInfo = document.getElementById('usage-retention-info');
        if (retentionInfo && data.retention_days) {
            retentionInfo.textContent = `保留 ${data.retention_days} 天`;
        }

        if (users.length === 0) {
            container.innerHTML = '<p style="color: #999;">區間內尚無使用紀錄</p>';
            return;
        }

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8f9fa; text-align: left;">
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">使用者</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6; text-align: right;">請求數</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6; text-align: right;">錯誤數</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6; text-align: right;">Token 加總</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6; text-align: right;">平均耗時</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">最後使用</th>
                        <th style="padding: 10px; border-bottom: 2px solid #dee2e6;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => {
                        const errRate = u.requests > 0 ? (100 * u.errors / u.requests).toFixed(1) : 0;
                        return `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;"><strong>${escapeHtml(u.username)}</strong></td>
                            <td style="padding: 10px; text-align: right; font-weight: 600;">${u.requests.toLocaleString()}</td>
                            <td style="padding: 10px; text-align: right; color: ${u.errors > 0 ? '#dc3545' : '#999'};">${u.errors} (${errRate}%)</td>
                            <td style="padding: 10px; text-align: right;">${(u.tokens || 0).toLocaleString()}</td>
                            <td style="padding: 10px; text-align: right; color: #666;">${Math.round(u.avg_ms || 0)} ms</td>
                            <td style="padding: 10px; color: #666;">${u.last_used ? new Date(u.last_used).toLocaleString('zh-TW') : '-'}</td>
                            <td style="padding: 10px;">
                                <button onclick="filterUsageByUser('${escapeHtml(u.username)}')"
                                    style="padding: 4px 10px; border: 1px solid #f59e0b; border-radius: 4px; cursor: pointer; background: #fff7ed; color: #ea580c; font-size: 12px;">
                                    查看明細
                                </button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = `<p style="color: #dc3545;">載入失敗: ${e.message}</p>`;
    }
}

function filterUsageByUser(username) {
    document.getElementById('usage-filter-username').value = username;
    loadUsageLogs(true);
    document.getElementById('usage-logs-list').scrollIntoView({ behavior: 'smooth' });
}

async function manualPruneUsageLogs() {
    const input = prompt('清理多少天以前的紀錄？\n(留空使用伺服器預設保留期，輸入 0 = 全部刪除)');
    if (input === null) return;
    const olderThanDays = input.trim();
    const params = new URLSearchParams();
    if (olderThanDays !== '') {
        const n = parseInt(olderThanDays);
        if (isNaN(n) || n < 0) { alert('請輸入 0 或正整數'); return; }
        if (n === 0 && !confirm('這會刪除「全部」使用紀錄，確定？')) return;
        params.set('older_than_days', n);
    }
    try {
        const res = await authFetch(`${API_URL}/api/usage?${params.toString()}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || '清理失敗');
        alert(`已刪除 ${data.deleted} 筆紀錄`);
        loadUsage();
    } catch (e) {
        alert('清理失敗: ' + e.message);
    }
}

// Public entry: called when admin sub-tab "usage" is opened
function loadUsage() {
    loadUsageSummary();
    loadUsageLogs(true);
}

// Called from "使用者管理" row → switch to usage tab and prefill username filter
function viewUserUsage(username) {
    const usageTabBtn = document.querySelector('.admin-sub-tab[onclick*="\'usage\'"]');
    if (usageTabBtn) {
        switchAdminSubTab(usageTabBtn, 'usage');
    }
    // The summary loads on tab switch; now apply user filter for the detail table
    setTimeout(() => {
        const input = document.getElementById('usage-filter-username');
        if (input) input.value = username;
        loadUsageLogs(true);
    }, 100);
}
