// ==========================================================================
// KEYS MODULE
// ==========================================================================

async function loadApiKeys() {
    const container = document.getElementById('api-keys-list');
    container.innerHTML = '<p style="color: #666;">載入中...</p>';

    try {
        const response = await authFetch(`${API_URL}/api/keys`);
        if (!response.ok) {
            throw new Error('無法載入 API Keys');
        }

        const data = await response.json();
        const keys = data.keys || [];

        if (keys.length === 0) {
            container.innerHTML = '<p style="color: #666;">尚無 API Key</p>';
            return;
        }

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f9fa; text-align: left;">
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">使用者</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">用途</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">狀態</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">使用次數</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">建立時間</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">最後使用</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${keys.map(key => `
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 12px;">
                                <strong>${escapeHtml(key.username)}</strong>
                                ${key.is_admin ? '<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 8px;">管理員</span>' : ''}
                                <br><small style="color: #999; font-family: monospace;">${key.api_key_prefix}</small>
                            </td>
                            <td style="padding: 12px; color: #555;">${key.description ? escapeHtml(key.description) : '<span style="color: #ccc;">-</span>'}</td>
                            <td style="padding: 12px;">
                                ${key.is_active
                                    ? '<span style="color: #28a745;">&#10003; 啟用</span>'
                                    : '<span style="color: #dc3545;">&#10007; 停用</span>'}
                            </td>
                            <td style="padding: 12px; font-weight: ${key.request_count > 0 ? 'bold' : 'normal'}; color: ${key.request_count > 0 ? '#333' : '#ccc'};">${key.request_count.toLocaleString()}</td>
                            <td style="padding: 12px; font-size: 13px; color: #666;">${key.created_at ? new Date(key.created_at).toLocaleDateString('zh-TW') : '-'}</td>
                            <td style="padding: 12px; font-size: 13px; color: #666;">${key.last_used_at ? new Date(key.last_used_at).toLocaleString('zh-TW') : '<span style="color: #ccc;">從未</span>'}</td>
                            <td style="padding: 12px; white-space: nowrap;">
                                <button onclick="toggleKeyStatus(${key.id}, ${!key.is_active})"
                                        style="padding: 5px 10px; margin-right: 4px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: ${key.is_active ? '#fff3cd' : '#d4edda'}; font-size: 12px;">
                                    ${key.is_active ? '停用' : '啟用'}
                                </button>
                                <button onclick="regenerateKey(${key.id}, '${escapeHtml(key.username)}')"
                                        style="padding: 5px 10px; margin-right: 4px; border: 1px solid #17a2b8; border-radius: 4px; cursor: pointer; background: #e7f5ff; color: #17a2b8; font-size: 12px;">
                                    重新產生
                                </button>
                                <button onclick="deleteApiKey(${key.id}, '${escapeHtml(key.username)}')"
                                        style="padding: 5px 10px; border: 1px solid #dc3545; border-radius: 4px; cursor: pointer; background: #fff; color: #dc3545; font-size: 12px;">
                                    刪除
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
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
    const isAdmin = document.getElementById('new-key-admin').checked;

    if (!username) {
        alert('請輸入使用者名稱');
        return;
    }

    if (username.length < 2) {
        alert('使用者名稱至少需要 2 個字元');
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
