// ==========================================================================
// STATUS MODULE
// ==========================================================================

async function checkStatusEnhanced() {
    const dashboard = document.getElementById('monitor-dashboard');
    const overallIcon = document.getElementById('overall-icon');
    const overallTitle = document.getElementById('overall-title');
    const overallDesc = document.getElementById('overall-desc');
    const onlineCount = document.getElementById('online-count');
    const offlineCount = document.getElementById('offline-count');
    const totalModels = document.getElementById('total-models');
    const lastUpdate = document.getElementById('last-update');

    try {
        // 同時獲取健康狀態和模型列表
        const [healthResponse, modelsResponse] = await Promise.all([
            authFetch(`${API_URL}/health`),
            authFetch(`${API_URL}/v1/models`)
        ]);

        if (!healthResponse.ok) throw new Error('Health check failed');

        const healthData = await healthResponse.json();
        const modelsData = modelsResponse.ok ? await modelsResponse.json() : { data: [] };

        // 計算統計
        const endpoints = Object.entries(healthData.endpoints);
        const online = endpoints.filter(([_, status]) => status === 'healthy').length;
        const offline = endpoints.length - online;
        const modelCount = modelsData.data ? modelsData.data.length : 0;

        // 更新整體狀態
        if (offline === 0) {
            overallIcon.textContent = '✅';
            overallTitle.textContent = '所有服務運行正常';
            overallDesc.textContent = `${online} 個服務在線，${modelCount} 個模型可用`;
            document.getElementById('overall-status').style.background = '#10b981';
        } else if (online > 0) {
            overallIcon.textContent = '⚠️';
            overallTitle.textContent = '部分服務異常';
            overallDesc.textContent = `${offline} 個服務離線，請檢查`;
            document.getElementById('overall-status').style.background = '#f59e0b';
        } else {
            overallIcon.textContent = '❌';
            overallTitle.textContent = '服務全部離線';
            overallDesc.textContent = '請檢查服務狀態';
            document.getElementById('overall-status').style.background = '#ef4444';
        }

        onlineCount.textContent = online;
        offlineCount.textContent = offline;
        totalModels.textContent = modelCount;
        lastUpdate.textContent = new Date().toLocaleTimeString('zh-TW');

        // 分組：運行中 vs 離線
        const onlineEndpoints = endpoints.filter(([_, s]) => s === 'healthy');
        const offlineEndpoints = endpoints.filter(([_, s]) => s !== 'healthy');

        function renderRow(endpoint, status) {
            const config = serviceConfig[endpoint] || { icon: '🔌', name: endpoint, desc: '', model: '' };
            const isOnline = status === 'healthy';
            const dotColor = isOnline ? '#10b981' : '#ef4444';
            const labelColor = isOnline ? '#10b981' : '#ef4444';
            const labelBg = isOnline ? '#ecfdf5' : '#fef2f2';
            const labelText = isOnline ? '運行中' : '離線';
            const modelInfo = config.model ? `<span style="color: #999; font-size: 12px; margin-left: 8px;">${config.model}</span>` : '';

            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;"></span>
                        <span style="font-size: 14px; font-weight: 500; color: #333;">${config.name}</span>
                        ${modelInfo}
                    </div>
                    <span style="font-size: 12px; color: ${labelColor}; background: ${labelBg}; padding: 2px 10px; border-radius: 10px;">${labelText}</span>
                </div>`;
        }

        let html = `<div style="font-size: 13px; color: #999; margin-bottom: 12px;">${endpoints.length} 個端點</div>`;

        // 運行中列表
        if (onlineEndpoints.length > 0) {
            html += onlineEndpoints.map(([ep, st]) => renderRow(ep, st)).join('');
        }

        // 離線列表（有間隔分隔）
        if (offlineEndpoints.length > 0) {
            if (onlineEndpoints.length > 0) {
                html += `<div style="margin: 12px 0; border-top: 2px solid #fecaca;"></div>`;
            }
            html += offlineEndpoints.map(([ep, st]) => renderRow(ep, st)).join('');
        }

        dashboard.innerHTML = html;

        // 同時更新舊版介面（保持相容性）
        checkStatus();

    } catch (error) {
        console.error('Status check failed:', error);
        overallIcon.textContent = '❌';
        overallTitle.textContent = '無法連接服務';
        overallDesc.textContent = error.message;
        document.getElementById('overall-status').style.background = '#64748b';

        dashboard.innerHTML = `
            <div class="monitor-card offline">
                <div class="monitor-header">
                    <div class="monitor-title">
                        <div class="monitor-icon">❌</div>
                        <div>
                            <div class="monitor-name">連接失敗</div>
                            <div class="monitor-type">${error.message}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

async function checkStatus() {
    const gatewayStatus = document.getElementById('gateway-status');
    const gatewayText = document.getElementById('gateway-text');
    const endpointList = document.getElementById('endpoint-list');

    try {
        // 檢查 Gateway 狀態
        const response = await authFetch(`${API_URL}/health`);
        if (response.ok) {
            const data = await response.json();
            gatewayStatus.className = 'status-indicator status-online';
            gatewayText.textContent = 'Gateway 運行中';

            // 更新端點列表
            endpointList.innerHTML = '';
            for (const [endpoint, status] of Object.entries(data.endpoints)) {
                const li = document.createElement('li');
                li.className = 'endpoint-item';
                li.innerHTML = `
                    <span>${endpoint}</span>
                    <span>
                        <span class="status-indicator ${status === 'healthy' ? 'status-online' : 'status-offline'}"></span>
                        ${status === 'healthy' ? '正常' : '離線'}
                    </span>
                `;
                endpointList.appendChild(li);
            }
        } else {
            throw new Error('Gateway 無回應');
        }
    } catch (error) {
        gatewayStatus.className = 'status-indicator status-offline';
        gatewayText.textContent = 'Gateway 離線 - 請啟動服務器';
        endpointList.innerHTML = '<li>無法連接到 Gateway</li>';
    }
}

// 儲存模型資料

// 載入模型清單到下拉選單