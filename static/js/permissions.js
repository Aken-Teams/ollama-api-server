// ==========================================================================
// PERMISSIONS MODULE
// ==========================================================================

let permEditingUser = null;
let allModelsCache = [];

async function loadPermissions() {
    const container = document.getElementById('permissions-list');
    if (!container) return;
    container.innerHTML = '<p style="color: #666;">載入中...</p>';

    try {
        const response = await authFetch(`${API_URL}/api/permissions`);
        if (!response.ok) throw new Error('無法載入權限資料');

        const data = await response.json();
        const users = data.users || [];

        if (users.length === 0) {
            container.innerHTML = '<p style="color: #666;">尚無使用者</p>';
            return;
        }

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f9fa; text-align: left;">
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">使用者</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">允許功能</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">模型限制</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">每日上限</th>
                        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => {
                        const featuresText = u.allowed_features
                            ? u.allowed_features.map(f => featureLabel(f)).join(', ')
                            : '<span style="color: #28a745;">全部</span>';
                        const modelsText = u.allowed_models
                            ? `<span style="color: #f59e0b;">${u.allowed_models.length} 個模型</span>`
                            : '<span style="color: #28a745;">全部</span>';
                        const limitText = u.daily_request_limit > 0
                            ? `${u.daily_request_limit.toLocaleString()} 次/天`
                            : '<span style="color: #28a745;">無限制</span>';
                        return `
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 12px;">
                                <strong>${escapeHtml(u.username)}</strong>
                                ${u.description ? `<br><small style="color: #999;">${escapeHtml(u.description)}</small>` : ''}
                            </td>
                            <td style="padding: 12px; font-size: 13px;">${featuresText}</td>
                            <td style="padding: 12px; font-size: 13px;">${modelsText}</td>
                            <td style="padding: 12px; font-size: 13px;">${limitText}</td>
                            <td style="padding: 12px;">
                                <button onclick="editPermissions('${escapeHtml(u.username)}')"
                                    style="padding: 6px 14px; border: 1px solid #f59e0b; border-radius: 20px; cursor: pointer; background: #fff7ed; color: #ea580c; font-size: 12px;">
                                    編輯
                                </button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<p style="color: #dc3545;">載入失敗: ${error.message}</p>`;
    }
}

function featureLabel(feature) {
    const labels = {
        'chat': '對話',
        'speech': '語音',
        'ocr': 'OCR',
        'embeddings': 'Embeddings'
    };
    return labels[feature] || feature;
}

async function editPermissions(username) {
    permEditingUser = username;
    document.getElementById('perm-edit-username').textContent = username;
    document.getElementById('perm-editor').style.display = 'block';
    document.getElementById('perm-editor').scrollIntoView({ behavior: 'smooth' });

    // Load current permissions
    try {
        const response = await authFetch(`${API_URL}/api/permissions/${encodeURIComponent(username)}`);
        if (!response.ok) throw new Error('無法載入');
        const data = await response.json();

        // Set feature checkboxes
        const features = data.allowed_features;
        ['chat', 'speech', 'ocr', 'embeddings'].forEach(f => {
            const cb = document.getElementById('perm-feat-' + f);
            if (cb) cb.checked = features ? features.includes(f) : false;
        });

        // Set limits
        document.getElementById('perm-daily-requests').value = data.daily_request_limit || 0;
        document.getElementById('perm-daily-tokens').value = data.daily_token_limit || 0;

        // Load models list
        await loadModelsForPermissions(data.allowed_models);
    } catch (error) {
        alert('載入權限失敗: ' + error.message);
    }
}

async function loadModelsForPermissions(allowedModels) {
    const container = document.getElementById('perm-models-list');

    try {
        if (allModelsCache.length === 0) {
            const response = await authFetch(`${API_URL}/v1/models`);
            if (response.ok) {
                const data = await response.json();
                allModelsCache = (data.data || []).map(m => m.id).sort();
            }
        }

        if (allModelsCache.length === 0) {
            container.innerHTML = '<p style="color: #999;">無法載入模型列表</p>';
            return;
        }

        container.innerHTML = allModelsCache.map(modelId => {
            const checked = allowedModels ? allowedModels.includes(modelId) : false;
            return `
                <label style="display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" class="perm-model-cb" value="${escapeHtml(modelId)}" ${checked ? 'checked' : ''}>
                    ${escapeHtml(modelId)}
                </label>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<p style="color: #dc3545;">載入失敗</p>';
    }
}

function closePermEditor() {
    document.getElementById('perm-editor').style.display = 'none';
    permEditingUser = null;
}

async function savePermissions() {
    if (!permEditingUser) return;

    // Collect features
    const featureCheckboxes = ['chat', 'speech', 'ocr', 'embeddings'];
    const selectedFeatures = featureCheckboxes.filter(f => {
        const cb = document.getElementById('perm-feat-' + f);
        return cb && cb.checked;
    });

    // Collect models
    const modelCbs = document.querySelectorAll('.perm-model-cb:checked');
    const selectedModels = Array.from(modelCbs).map(cb => cb.value);

    // Collect limits
    const dailyRequests = parseInt(document.getElementById('perm-daily-requests').value) || 0;
    const dailyTokens = parseInt(document.getElementById('perm-daily-tokens').value) || 0;

    // If nothing selected, set to null (= no restriction)
    const body = {
        allowed_features: selectedFeatures.length > 0 ? selectedFeatures : null,
        allowed_models: selectedModels.length > 0 ? selectedModels : null,
        daily_request_limit: dailyRequests,
        daily_token_limit: dailyTokens
    };

    try {
        const response = await authFetch(`${API_URL}/api/permissions/${encodeURIComponent(permEditingUser)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || '儲存失敗');

        alert('權限已儲存');
        closePermEditor();
        loadPermissions();
    } catch (error) {
        alert('儲存失敗: ' + error.message);
    }
}

async function resetPermissions() {
    if (!permEditingUser) return;
    if (!confirm(`確定要將「${permEditingUser}」的權限重置為無限制嗎？`)) return;

    try {
        const response = await authFetch(`${API_URL}/api/permissions/${encodeURIComponent(permEditingUser)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || '重置失敗');
        }

        alert('權限已重置為無限制');
        closePermEditor();
        loadPermissions();
    } catch (error) {
        alert('重置失敗: ' + error.message);
    }
}
