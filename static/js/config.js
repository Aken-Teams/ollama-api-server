// ==========================================================================
// CONFIG MODULE
// ==========================================================================

async function loadDeepSeekConfig() {
    const statusDiv = document.getElementById('deepseek-status');
    const balanceDiv = document.getElementById('deepseek-balance');

    statusDiv.innerHTML = '<p style="color: #666;">載入中...</p>';
    balanceDiv.style.display = 'none';

    try {
        // Load balance info
        const balanceResponse = await authFetch(`${API_URL}/api/deepseek/balance`);

        if (balanceResponse.ok) {
            const data = await balanceResponse.json();

            // Show balance cards
            balanceDiv.style.display = 'block';

            // Update balance display
            const cnyBalance = data.balance?.CNY?.total || '0.00';
            document.getElementById('deepseek-balance-cny').textContent = `¥ ${cnyBalance}`;

            // Update availability status
            const availableDiv = document.getElementById('deepseek-available');
            if (data.is_available) {
                availableDiv.textContent = '正常';
                availableDiv.style.color = '#10b981';
            } else {
                availableDiv.textContent = '餘額不足';
                availableDiv.style.color = '#ef4444';
            }

            // Update key display
            const keyDisplay = document.getElementById('deepseek-key-display');
            keyDisplay.textContent = data.api_key_status || '--';
            keyDisplay.style.color = data.api_key_status === '已設定' ? '#10b981' : '#ef4444';

            // Clear status text (info now shown in cards above)
            statusDiv.innerHTML = '';
        } else {
            const errorData = await balanceResponse.json();
            statusDiv.innerHTML = `<p style="color: #dc3545;">❌ ${errorData.detail || '無法載入 DeepSeek 配置'}</p>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<p style="color: #dc3545;">❌ 載入失敗: ${error.message}</p>`;
    }
}

// Update DeepSeek API Key
async function updateDeepSeekKey() {
    const keyInput = document.getElementById('new-deepseek-key');
    const newKey = keyInput.value.trim();

    if (!newKey) {
        alert('請輸入新的 API Key');
        return;
    }

    if (!newKey.startsWith('sk-')) {
        alert('無效的 API Key 格式（應以 sk- 開頭）');
        return;
    }

    if (!confirm('確定要更新 DeepSeek API Key 嗎？')) {
        return;
    }

    try {
        const response = await authFetch(`${API_URL}/api/deepseek/config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ api_key: newKey })
        });

        const data = await response.json();

        if (response.ok) {
            alert(`✅ ${data.message}\n\n餘額: ¥${data.balance?.balance_infos?.find(b => b.currency === 'CNY')?.total_balance || '--'}`);
            keyInput.value = '';
            loadDeepSeekConfig();
        } else {
            alert(`❌ 更新失敗: ${data.detail}`);
        }
    } catch (error) {
        alert(`❌ 更新失敗: ${error.message}`);
    }
}

// ========== API Key Management ==========

// Load API Keys list