// ==========================================================================
// HISTORY MODULE
// ==========================================================================

function openHistoryPage() {
    switchTab('history');
}

// 驗證密碼
function verifyHistoryPassword() {
    const passwordInput = document.getElementById('history-password');
    const errorMsg = document.getElementById('history-error');
    const password = passwordInput.value;

    if (password === HISTORY_PASSWORD) {
        historyAuthenticated = true;
        document.getElementById('history-login').style.display = 'none';
        document.getElementById('history-content').style.display = 'block';
        errorMsg.style.display = 'none';
        passwordInput.value = '';
        loadHistoryConversations();
        loadHistoryModelFilter();
    } else {
        errorMsg.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// 登出
function logoutHistory() {
    historyAuthenticated = false;
    document.getElementById('history-login').style.display = 'block';
    document.getElementById('history-content').style.display = 'none';
    document.getElementById('history-list').innerHTML = '<p class="empty-state">載入中...</p>';
}

// 載入模型篩選選項
async function loadHistoryModelFilter() {
    try {
        const response = await authFetch(`${API_URL}/v1/models`);
        const data = await response.json();
        const select = document.getElementById('history-model-filter');

        if (data.data && select) {
            select.innerHTML = '<option value="">全部模型</option>';
            data.data.forEach(model => {
                select.innerHTML += `<option value="${model.id}">${model.id}</option>`;
            });
        }
    } catch (error) {
        console.error('Failed to load model filter:', error);
    }
}

// 載入歷史對話
async function loadHistoryConversations(page = 0) {
    if (!historyAuthenticated) return;

    historyCurrentPage = page;
    const offset = page * historyPageSize;
    const search = document.getElementById('history-search')?.value || '';
    const model = document.getElementById('history-model-filter')?.value || '';

    const listContainer = document.getElementById('history-list');
    const totalSpan = document.getElementById('history-total');

    listContainer.innerHTML = '<p class="empty-state">載入中...</p>';

    try {
        let url = `${API_URL}/api/conversations?limit=${historyPageSize}&offset=${offset}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (model) url += `&model=${encodeURIComponent(model)}`;

        const response = await authFetch(url);
        const data = await response.json();

        totalSpan.textContent = data.total || 0;

        if (!data.conversations || data.conversations.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">暫無對話紀錄</p>';
            document.getElementById('history-pagination').innerHTML = '';
            return;
        }

        listContainer.innerHTML = data.conversations.map(conv => {
            const timestamp = new Date(conv.timestamp).toLocaleString('zh-TW');
            const userMessages = conv.messages.filter(m => m.role === 'user');
            const lastUserMessage = userMessages.length > 0 ?
                userMessages[userMessages.length - 1].content : '';
            const previewText = typeof lastUserMessage === 'string' ?
                lastUserMessage.substring(0, 100) : '[多媒體內容]';
            const displayUsername = conv.username || '未知使用者';

            return `
                <div class="conversation-item ${conv.success ? '' : 'error'}">
                    <div class="conversation-header">
                        <div class="conversation-meta">
                            <span class="conversation-user" title="使用者: ${escapeHtml(displayUsername)}">👤 ${escapeHtml(displayUsername)}</span>
                            <span class="conversation-model">${conv.model}</span>
                            <span>${timestamp}</span>
                            <span>${conv.response_time_ms || 0}ms</span>
                            <span>${conv.total_tokens || 0} tokens</span>
                            ${!conv.success ? '<span style="color: #dc3545;">失敗</span>' : ''}
                        </div>
                    </div>
                    <div class="conversation-body">
                        ${conv.messages.map(msg => `
                            <div class="message-block">
                                <div class="message-role">${msg.role}</div>
                                <div class="message-content">${escapeHtml(
                                    typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                                )}</div>
                            </div>
                        `).join('')}
                        <div class="message-block response-block">
                            <div class="message-role">Assistant</div>
                            <div class="message-content">${escapeHtml(conv.response || '')}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 分頁
        renderHistoryPagination(data.total, page);

    } catch (error) {
        console.error('Failed to load history:', error);
        listContainer.innerHTML = `<p class="empty-state" style="color: #dc3545;">載入失敗: ${error.message}</p>`;
    }
}

// 渲染分頁
function renderHistoryPagination(total, currentPage) {
    const totalPages = Math.ceil(total / historyPageSize);
    const pagination = document.getElementById('history-pagination');

    if (!pagination || totalPages <= 1) {
        if (pagination) pagination.innerHTML = '';
        return;
    }

    let html = '';
    html += `<button ${currentPage === 0 ? 'disabled' : ''} onclick="loadHistoryConversations(${currentPage - 1})">上一頁</button>`;

    const startPage = Math.max(0, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 5);

    for (let i = startPage; i < endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="loadHistoryConversations(${i})">${i + 1}</button>`;
    }

    html += `<button ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="loadHistoryConversations(${currentPage + 1})">下一頁</button>`;

    pagination.innerHTML = html;
}

// 清除對話紀錄
async function clearHistoryConversations() {
    if (!historyAuthenticated) return;
    if (!confirm('確定要清除所有對話紀錄嗎？此操作無法復原。')) return;

    try {
        await authFetch(`${API_URL}/api/conversations`, { method: 'DELETE' });
        loadHistoryConversations();
        alert('已清除所有對話紀錄');
    } catch (error) {
        alert('清除失敗: ' + error.message);
    }
}

// ==================== 歷史紀錄功能結束 ====================

// 視覺模型圖片拖放支援
document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('vision-upload-area');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#667eea';
            uploadArea.style.background = 'rgba(102, 126, 234, 0.1)';
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#ddd';
            uploadArea.style.background = '#fafafa';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#ddd';
            uploadArea.style.background = '#fafafa';

            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleVisionImageFile(file);
            }
        });
    }
});

// ===== 語音轉文字功能 =====

// 翻譯選項切換
document.addEventListener('DOMContentLoaded', function() {
    const enableTranslate = document.getElementById('enable-translate');
    const langContainer = document.getElementById('translate-lang-container');
    if (enableTranslate && langContainer) {
        enableTranslate.addEventListener('change', function() {
            langContainer.style.display = this.checked ? 'flex' : 'none';
        });
    }
});
