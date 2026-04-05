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

        function renderOfflineRow(endpoint) {
            const config = serviceConfig[endpoint] || { icon: '🔌', name: endpoint, desc: '', model: '' };
            const modelInfo = config.model ? `<span style="color: #b0b0b0; font-size: 11px;"> · ${config.model}</span>` : '';
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #ef4444; flex-shrink: 0;"></span>
                        <span style="font-size: 13px; font-weight: 500; color: #666;">${config.name}${modelInfo}</span>
                    </div>
                </div>`;
        }

        // 摘要區塊
        let html = '';

        // 運行中摘要
        html += `<div style="display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #f0fdf4; border-radius: 10px; margin-bottom: 12px;">
            <div style="width: 36px; height: 36px; background: #10b981; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <span style="color: #fff; font-size: 16px; font-weight: 700;">${onlineEndpoints.length}</span>
            </div>
            <div>
                <div style="font-size: 13px; font-weight: 600; color: #166534;">服務運行中</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 1px;">${onlineEndpoints.map(([ep]) => (serviceConfig[ep] || {name: ep}).name).join('、')}</div>
            </div>
        </div>`;

        // 離線列表（只有離線時才展開詳細）
        if (offlineEndpoints.length > 0) {
            html += `<div style="padding: 14px 16px; background: #fef2f2; border-radius: 10px;">
                <div style="font-size: 13px; font-weight: 600; color: #991b1b; margin-bottom: 8px;">${offlineEndpoints.length} 個服務離線</div>`;
            html += offlineEndpoints.map(([ep]) => renderOfflineRow(ep)).join('');
            html += `</div>`;
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