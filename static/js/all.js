const API_URL = window.location.origin;
        let currentPage = 0;
        const pageSize = 10;

        // ========== Authentication System ==========
        let currentApiKey = localStorage.getItem('pj_api_key') || '';
        let currentUser = null;
        let isAuthenticated = localStorage.getItem('pj_authenticated') === 'true';

        // Custom fetch with API Key
        async function authFetch(url, options = {}) {
            if (!isAuthenticated || !currentApiKey) {
                throw new Error('Not authenticated');
            }

            const headers = {
                ...options.headers,
                'Authorization': `Bearer ${currentApiKey}`
            };

            return fetch(url, { ...options, headers });
        }

        // Check authentication on page load
        async function checkAuth() {
            if (isAuthenticated && currentApiKey) {
                // Restore user from localStorage
                try {
                    const savedUser = localStorage.getItem('pj_user');
                    if (savedUser) currentUser = JSON.parse(savedUser);
                } catch (e) {}

                // Verify API key is still valid
                try {
                    const response = await authFetch(`${API_URL}/health`);
                    if (response.ok) {
                        showMainContent();
                        return true;
                    }
                } catch (e) {
                    console.log('Auth check failed:', e);
                }
                // Invalid session, clear it
                localStorage.removeItem('pj_authenticated');
                localStorage.removeItem('pj_api_key');
                localStorage.removeItem('pj_user');
                isAuthenticated = false;
                currentApiKey = '';
                currentUser = null;
            }
            showLoginPage();
            return false;
        }

        // Handle login form submit
        async function handleLogin(event) {
            event.preventDefault();

            const passwordInput = document.getElementById('password-input');
            const loginBtn = document.getElementById('login-btn');
            const loginError = document.getElementById('login-error');

            const usernameInput = document.getElementById('username-input');
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            if (!username || !password) {
                loginError.textContent = '請輸入帳號和密碼';
                loginError.classList.add('show');
                return;
            }

            loginBtn.disabled = true;
            loginBtn.textContent = '驗證中...';
            loginError.classList.remove('show');

            try {
                const response = await fetch(`${API_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (response.ok) {
                    const data = await response.json();
                    isAuthenticated = true;
                    currentApiKey = data.api_key;
                    currentUser = data.user;
                    localStorage.setItem('pj_authenticated', 'true');
                    localStorage.setItem('pj_api_key', data.api_key);
                    localStorage.setItem('pj_user', JSON.stringify(data.user));

                    showMainContent();
                } else {
                    const err = await response.json().catch(() => null);
                    loginError.textContent = err?.detail || '帳號或密碼錯誤';
                    loginError.classList.add('show');
                }
            } catch (e) {
                loginError.textContent = '連線失敗，請稍後再試';
                loginError.classList.add('show');
            }

            loginBtn.disabled = false;
            loginBtn.textContent = '登入';
        }

        // Handle logout
        function handleLogout() {
            localStorage.removeItem('pj_authenticated');
            localStorage.removeItem('pj_api_key');
            localStorage.removeItem('pj_user');
            isAuthenticated = false;
            currentApiKey = '';
            currentUser = null;
            showLoginPage();
        }

        // Show login page
        function showLoginPage() {
            document.getElementById('login-overlay').classList.remove('hidden');
            document.getElementById('main-content').classList.remove('visible');
            document.getElementById('username-input').value = '';
            document.getElementById('password-input').value = '';
        }

        // Show main content
        function showMainContent() {
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.add('visible');

            // Update user info
            if (currentUser) {
                document.getElementById('current-username').textContent = currentUser.username;
                if (currentUser.is_admin) {
                    document.getElementById('admin-badge').style.display = 'inline';
                    document.getElementById('keys-tab').style.display = 'block';
                    document.getElementById('users-tab').style.display = 'block';
                } else {
                    document.getElementById('admin-badge').style.display = 'none';
                    document.getElementById('keys-tab').style.display = 'none';
                    document.getElementById('users-tab').style.display = 'none';
                }
            }

            // Load initial data
            checkStatusEnhanced();
            loadModelOptions();
            loadStats();
        }

        // ========== DeepSeek API Key Management ==========

        // Load DeepSeek config and balance
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

                    // Show balance card
                    balanceDiv.style.display = 'block';

                    // Update balance display
                    const cnyBalance = data.balance?.CNY?.total || '0.00';
                    document.getElementById('deepseek-balance-cny').textContent = `¥ ${cnyBalance}`;

                    // Update availability status
                    const availableDiv = document.getElementById('deepseek-available');
                    if (data.is_available) {
                        availableDiv.textContent = '✓ 可用';
                        availableDiv.style.background = 'rgba(40, 167, 69, 0.3)';
                    } else {
                        availableDiv.textContent = '✗ 餘額不足';
                        availableDiv.style.background = 'rgba(220, 53, 69, 0.3)';
                    }

                    // Update key display (show status only, not the key)
                    document.getElementById('deepseek-key-display').textContent = data.api_key_status || '--';

                    // Update status
                    statusDiv.innerHTML = `
                        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                            <div><strong>狀態：</strong> <span style="color: ${data.is_available ? '#28a745' : '#dc3545'};">${data.is_available ? '正常' : '餘額不足'}</span></div>
                            <div><strong>API Key：</strong> <span style="color: ${data.api_key_status === '已設定' ? '#28a745' : '#dc3545'};">${data.api_key_status}</span></div>
                        </div>
                    `;
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
        async function loadApiKeys() {
            const container = document.getElementById('api-keys-list');
            container.innerHTML = '<p style="color: #666;">載入中...</p>';

            try {
                const response = await authFetch(`${API_URL}/api/keys`);
                if (!response.ok) {
                    throw new Error('無法載入 API Keys');
                }

                const data = await response.json();

                // 過濾掉系統管理員帳號
                const filteredKeys = data.keys ? data.keys.filter(key => key.username !== 'zhpjaiaoi') : [];

                if (filteredKeys.length === 0) {
                    container.innerHTML = '<p style="color: #666;">尚無 API Key</p>';
                    return;
                }

                container.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa; text-align: left;">
                                <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">使用者</th>
                                <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Key 前綴</th>
                                <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">狀態</th>
                                <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">使用次數</th>
                                <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">最後使用</th>
                                <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredKeys.map(key => `
                                <tr style="border-bottom: 1px solid #dee2e6;">
                                    <td style="padding: 12px;">
                                        <strong>${escapeHtml(key.username)}</strong>
                                        ${key.is_admin ? '<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 8px;">管理員</span>' : ''}
                                        ${key.description ? `<br><small style="color: #666;">${escapeHtml(key.description)}</small>` : ''}
                                    </td>
                                    <td style="padding: 12px; font-family: monospace;">${key.api_key_prefix}</td>
                                    <td style="padding: 12px;">
                                        ${key.is_active
                                            ? '<span style="color: #28a745;">✓ 啟用</span>'
                                            : '<span style="color: #dc3545;">✗ 停用</span>'}
                                    </td>
                                    <td style="padding: 12px;">${key.request_count.toLocaleString()}</td>
                                    <td style="padding: 12px; font-size: 13px;">${key.last_used_at ? new Date(key.last_used_at).toLocaleString('zh-TW') : '-'}</td>
                                    <td style="padding: 12px;">
                                        <button onclick="toggleKeyStatus(${key.id}, ${!key.is_active})"
                                                style="padding: 5px 10px; margin-right: 5px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: ${key.is_active ? '#fff3cd' : '#d4edda'};">
                                            ${key.is_active ? '停用' : '啟用'}
                                        </button>
                                        <button onclick="regenerateKey(${key.id}, '${escapeHtml(key.username)}')"
                                                style="padding: 5px 10px; margin-right: 5px; border: 1px solid #17a2b8; border-radius: 4px; cursor: pointer; background: #e7f5ff; color: #17a2b8;">
                                            重新產生
                                        </button>
                                        <button onclick="deleteApiKey(${key.id}, '${escapeHtml(key.username)}')"
                                                style="padding: 5px 10px; border: 1px solid #dc3545; border-radius: 4px; cursor: pointer; background: #fff; color: #dc3545;">
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

            try {
                const response = await authFetch(`${API_URL}/api/keys`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: username,
                        description: description || null,
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
            if (!confirm(`確定要重新產生 "${username}" 的 API Key 嗎？\n舊的 Key 將立即失效。`)) {
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
            if (!confirm(`確定要刪除 "${username}" 的 API Key 嗎？\n此操作無法復原。`)) {
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
        
        // 切換標籤頁
        function switchTab(tabName) {
            // 更新標籤狀態
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            event.target.classList.add('active');

            // 更新內容顯示
            document.querySelectorAll('.content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');

            // Load data for specific tabs
            if (tabName === 'keys') {
                loadApiKeys();
                loadDeepSeekConfig();
            }
        }
        
        // 檢查服務狀態
        // 自動刷新相關變數
        let autoRefreshEnabled = true;
        let autoRefreshInterval = null;

        // 切換自動刷新
        function toggleAutoRefresh() {
            autoRefreshEnabled = !autoRefreshEnabled;
            const toggle = document.getElementById('auto-refresh-toggle');
            toggle.classList.toggle('active', autoRefreshEnabled);

            if (autoRefreshEnabled) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        }

        function startAutoRefresh() {
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
            autoRefreshInterval = setInterval(checkStatusEnhanced, 30000);
        }

        function stopAutoRefresh() {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        }

        // 服務配置
        const serviceConfig = {
            'Endpoint-21180': { icon: '🦙', type: 'ollama', name: 'Ollama 21180', desc: 'LLM 推理服務', model: 'gpt-oss:120b' },
            'Endpoint-21181': { icon: '💎', type: 'ollama', name: 'Gemma4 31B', desc: '多模態推理服務', model: 'gemma4:31b' },
            'Endpoint-21182': { icon: '🦙', type: 'ollama', name: 'Ollama 21182', desc: 'Embedding 服務', model: 'Qwen3-Embedding-8B' },
            'Endpoint-21183': { icon: '🦙', type: 'ollama', name: 'Ollama 21183', desc: 'Reranker 服務', model: 'bge-reranker-v2-m3' },
            'Endpoint-21185': { icon: '🧠', type: 'ollama', name: 'Qwen3.5 122B', desc: 'MoE 推理服務', model: 'Qwen3.5:122b' },
            'DeepSeek-pj': { icon: '🧠', type: 'deepseek', name: 'DeepSeek API', desc: '雲端 AI 服務' },
            'LLaVA-Local': { icon: '👁️', type: 'vision', name: 'LLaVA 視覺', desc: '本地視覺模型' },
            'Speech-STT-8131': { icon: '🎤', type: 'speech', name: '語音轉文字', desc: 'Speech-to-Text 服務' },
            'OCR-Service': { icon: '📝', type: 'ocr', name: 'PP-OCR', desc: '文字辨識服務' },
            'DeepSeek-OCR': { icon: '🔮', type: 'deepseek-ocr', name: 'DeepSeek OCR', desc: 'GPU 加速 OCR' }
        };

        // 增強版狀態檢查
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

                // 生成服務卡片
                dashboard.innerHTML = endpoints.map(([endpoint, status]) => {
                    const config = serviceConfig[endpoint] || {
                        icon: '🔌',
                        type: 'default',
                        name: endpoint,
                        desc: '未知服務'
                    };
                    const isOnline = status === 'healthy';
                    const statusClass = isOnline ? 'online' : 'offline';
                    const cardClass = isOnline ? '' : 'offline';

                    return `
                        <div class="monitor-card ${cardClass}">
                            <div class="monitor-header">
                                <div class="monitor-title">
                                    <div class="monitor-icon ${config.type}">${config.icon}</div>
                                    <div>
                                        <div class="monitor-name">${config.name}</div>
                                        <div class="monitor-type">${config.desc}</div>
                                    </div>
                                </div>
                                <div class="status-badge ${statusClass}">
                                    <span class="status-dot"></span>
                                    ${isOnline ? '運行中' : '離線'}
                                </div>
                            </div>
                            ${config.model ? `
                            <div class="monitor-models">
                                <div class="monitor-models-title">可用模型</div>
                                <div class="monitor-models-list">${config.model}</div>
                            </div>
                            ` : ''}
                        </div>
                    `;
                }).join('');

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
        let modelsData = [];

        // 載入模型清單到下拉選單
        async function loadModelOptions() {
            const select = document.getElementById('model-select');
            try {
                const response = await authFetch(`${API_URL}/v1/models`);
                const data = await response.json();

                if (data.data && data.data.length > 0) {
                    modelsData = data.data;
                    select.innerHTML = data.data.map(model => {
                        const name = model.info ? model.info.name : model.id;
                        return `<option value="${model.id}">${name}</option>`;
                    }).join('');
                    // 顯示第一個模型的資訊
                    showModelInfo();
                } else {
                    select.innerHTML = '<option value="">無可用模型</option>';
                }
            } catch (error) {
                console.error('載入模型失敗:', error);
                select.innerHTML = `<option value="">載入失敗: ${error.message}</option>`;
            }
        }

        // 顯示模型資訊
        function showModelInfo() {
            const select = document.getElementById('model-select');
            const panel = document.getElementById('model-info-panel');
            const selectedId = select.value;

            const model = modelsData.find(m => m.id === selectedId);

            if (model && model.info) {
                const info = model.info;
                panel.style.display = 'block';
                panel.innerHTML = `
                    <div class="model-info-header">
                        <span class="model-info-name">${info.name}</span>
                        <span class="model-info-context">${info.context_length}</span>
                    </div>
                    <div class="model-info-description">${info.description}</div>
                    <div class="model-info-features">
                        ${info.features.map(f => `<span class="model-info-feature">${f}</span>`).join('')}
                    </div>
                    <div class="model-info-best">
                        <strong>最適合：</strong>${info.best_for}
                    </div>
                `;
            } else {
                panel.style.display = 'none';
            }

            // 檢查是否為視覺模型，顯示/隱藏圖片上傳區域
            const imageSection = document.getElementById('image-upload-section');
            const modelId = selectedId || '';
            const isVisionModel = modelId && (modelId.toLowerCase().includes('vl') || modelId.toLowerCase().includes('vision'));
            if (imageSection) {
                imageSection.style.display = isVisionModel ? 'block' : 'none';
            }
        }

        // 儲存上傳的圖片 Base64
        let uploadedImageBase64 = null;

        // 處理圖片選擇
        function handleImageSelect(event) {
            const file = event.target.files[0];
            if (file) {
                processImageFile(file);
            }
        }

        // 處理圖片檔案
        function processImageFile(file) {
            if (!file.type.startsWith('image/')) {
                alert('請選擇圖片檔案');
                return;
            }

            if (file.size > 20 * 1024 * 1024) {
                alert('圖片大小不能超過 20MB');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                uploadedImageBase64 = e.target.result;
                const preview = document.getElementById('image-preview');
                const placeholder = document.getElementById('upload-placeholder');
                const removeBtn = document.getElementById('remove-image-btn');

                preview.src = uploadedImageBase64;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
                removeBtn.style.display = 'inline-block';
            };
            reader.readAsDataURL(file);
        }

        // 移除圖片
        function removeImage() {
            uploadedImageBase64 = null;
            const preview = document.getElementById('image-preview');
            const placeholder = document.getElementById('upload-placeholder');
            const removeBtn = document.getElementById('remove-image-btn');
            const input = document.getElementById('image-input');

            preview.style.display = 'none';
            preview.src = '';
            placeholder.style.display = 'flex';
            removeBtn.style.display = 'none';
            input.value = '';
        }

        // 設置拖放事件
        document.addEventListener('DOMContentLoaded', function() {
            const uploadArea = document.getElementById('image-upload-area');
            if (uploadArea) {
                uploadArea.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    uploadArea.classList.add('dragover');
                });

                uploadArea.addEventListener('dragleave', function(e) {
                    e.preventDefault();
                    uploadArea.classList.remove('dragover');
                });

                uploadArea.addEventListener('drop', function(e) {
                    e.preventDefault();
                    uploadArea.classList.remove('dragover');
                    const file = e.dataTransfer.files[0];
                    if (file) {
                        processImageFile(file);
                    }
                });
            }

            // 音訊上傳拖放事件
            const audioUploadArea = document.getElementById('audio-upload-area');
            if (audioUploadArea) {
                audioUploadArea.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    audioUploadArea.classList.add('dragover');
                });

                audioUploadArea.addEventListener('dragleave', function(e) {
                    e.preventDefault();
                    audioUploadArea.classList.remove('dragover');
                });

                audioUploadArea.addEventListener('drop', function(e) {
                    e.preventDefault();
                    audioUploadArea.classList.remove('dragover');
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('audio/')) {
                        handleAudioFile(file);
                    }
                });
            }
        });

        // ===== 麥克風即時錄音功能 =====
        let mediaRecorder = null;
        let audioChunks = [];
        let isRecording = false;
        let recordingTimer = null;
        let recordingSeconds = 0;
        let lastMicResult = '';
        let lastMicTranslate = '';
        let lastRecordedBlob = null; // 保存最後的錄音 Blob

        // 切換麥克風錄音
        async function toggleMicRecording() {
            const micBtn = document.getElementById('mic-btn');
            const micStatus = document.getElementById('mic-status');
            const micTimer = document.getElementById('mic-timer');
            const waveform = document.getElementById('mic-waveform');

            if (micBtn.classList.contains('processing')) {
                return; // 處理中，不允許操作
            }

            if (!isRecording) {
                // 開始錄音
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];

                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    };

                    mediaRecorder.onstop = async () => {
                        // 停止所有音軌
                        stream.getTracks().forEach(track => track.stop());

                        // 創建音訊 Blob
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        lastRecordedBlob = audioBlob; // 保存錄音

                        // 顯示音頻播放器
                        showAudioPlayer(audioBlob);

                        // 處理錄音
                        await processRecordedAudio(audioBlob);
                    };

                    mediaRecorder.start();
                    isRecording = true;
                    recordingSeconds = 0;

                    micBtn.classList.add('recording');
                    micStatus.textContent = '錄音中... 點擊停止';
                    micStatus.style.color = '#ff4757';
                    micTimer.style.display = 'block';
                    waveform.style.display = 'flex';

                    // 開始計時
                    recordingTimer = setInterval(() => {
                        recordingSeconds++;
                        const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
                        const secs = (recordingSeconds % 60).toString().padStart(2, '0');
                        micTimer.textContent = `${mins}:${secs}`;
                    }, 1000);

                } catch (error) {
                    console.error('無法存取麥克風:', error);
                    alert('無法存取麥克風，請確認瀏覽器已授權麥克風權限');
                }
            } else {
                // 停止錄音
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
                isRecording = false;

                // 停止計時
                if (recordingTimer) {
                    clearInterval(recordingTimer);
                    recordingTimer = null;
                }

                micBtn.classList.remove('recording');
                micBtn.classList.add('processing');
                micStatus.textContent = '處理中...';
                micStatus.style.color = '#ffa502';
                waveform.style.display = 'none';
            }
        }

        // 處理錄製的音訊
        async function processRecordedAudio(audioBlob) {
            const micBtn = document.getElementById('mic-btn');
            const micStatus = document.getElementById('mic-status');
            const micTimer = document.getElementById('mic-timer');
            const resultContainer = document.getElementById('mic-result-container');
            const resultDiv = document.getElementById('mic-result');
            const resultStatus = document.getElementById('mic-result-status');
            const resultTime = document.getElementById('mic-result-time');
            const translateContainer = document.getElementById('mic-translate-container');
            const translateResult = document.getElementById('mic-translate-result');
            const translateLang = document.getElementById('mic-translate-lang');

            const enableTranslate = document.getElementById('mic-enable-translate').checked;
            const targetLanguage = document.getElementById('mic-target-language').value;

            resultContainer.style.display = 'block';
            translateContainer.style.display = 'none';
            resultStatus.textContent = '處理中...';
            resultStatus.classList.add('streaming');
            resultDiv.innerHTML = '<div class="vision-notice"><div class="notice-icon">🎙️</div><div class="notice-text"><strong>語音轉文字處理中</strong><br>正在分析錄音內容，請稍候...</div></div>';

            const startTime = Date.now();

            try {
                const formData = new FormData();
                // 將 webm 轉成 wav 格式的檔名
                formData.append('file', audioBlob, 'recording.webm');

                let apiUrl = `${API_URL}/v1/audio/transcriptions`;
                if (enableTranslate) {
                    apiUrl = `${API_URL}/v1/audio/transcribe-and-translate?target_language=${targetLanguage}&model=deepseek-chat`;
                }

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentApiKey}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                const elapsed = Date.now() - startTime;

                resultStatus.textContent = enableTranslate ? '轉錄+翻譯完成' : '轉錄完成';
                resultStatus.classList.remove('streaming');
                resultTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;

                // 顯示轉錄結果
                const originalText = enableTranslate ? data.original_text : data.text;
                if (originalText) {
                    lastMicResult = originalText;
                    resultDiv.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(originalText)}</div>`;
                } else if (originalText === '') {
                    lastMicResult = '';
                    resultDiv.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">🔇 未偵測到語音內容</div>`;
                } else {
                    lastMicResult = JSON.stringify(data, null, 2);
                    resultDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
                }

                // 如果啟用翻譯，顯示翻譯結果
                if (enableTranslate && data.translated_text) {
                    lastMicTranslate = data.translated_text;
                    translateContainer.style.display = 'block';
                    translateLang.textContent = data.target_language_name || targetLanguage;
                    translateResult.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(data.translated_text)}</div>`;
                } else if (enableTranslate && data.message) {
                    translateContainer.style.display = 'block';
                    translateLang.textContent = '';
                    translateResult.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">${escapeHtml(data.message)}</div>`;
                }

            } catch (error) {
                resultStatus.textContent = '轉錄失敗';
                resultStatus.classList.remove('streaming');
                resultDiv.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(error.message)}</div>`;
            } finally {
                // 重置按鈕狀態
                micBtn.classList.remove('processing');
                micStatus.textContent = '點擊開始錄音';
                micStatus.style.color = '#6c757d';
                micTimer.style.display = 'none';
                micTimer.textContent = '00:00';
            }
        }

        // 複製麥克風轉錄結果
        function copyMicResult() {
            if (lastMicResult) {
                navigator.clipboard.writeText(lastMicResult).then(() => {
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = '✅ 已複製';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 2000);
                });
            }
        }

        // 複製麥克風翻譯結果
        function copyMicTranslate() {
            if (lastMicTranslate) {
                navigator.clipboard.writeText(lastMicTranslate).then(() => {
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = '✅ 已複製';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 2000);
                });
            }
        }

        // 顯示音頻播放器
        function showAudioPlayer(audioBlob) {
            const container = document.getElementById('mic-audio-container');
            const player = document.getElementById('mic-audio-player');
            const durationSpan = document.getElementById('mic-audio-duration');

            // 創建音頻 URL
            const audioUrl = URL.createObjectURL(audioBlob);
            player.src = audioUrl;

            // 顯示容器
            container.style.display = 'block';

            // 載入後顯示時長
            player.onloadedmetadata = () => {
                const duration = player.duration;
                const mins = Math.floor(duration / 60).toString().padStart(2, '0');
                const secs = Math.floor(duration % 60).toString().padStart(2, '0');
                durationSpan.textContent = `時長: ${mins}:${secs}`;
            };
        }

        // 重新轉錄錄音
        async function reTranscribeRecording() {
            if (!lastRecordedBlob) {
                alert('沒有可用的錄音');
                return;
            }
            await processRecordedAudio(lastRecordedBlob);
        }

        // 清除錄音
        function clearRecording() {
            lastRecordedBlob = null;
            lastMicResult = '';
            lastMicTranslate = '';

            // 隱藏音頻播放器
            const audioContainer = document.getElementById('mic-audio-container');
            const player = document.getElementById('mic-audio-player');
            audioContainer.style.display = 'none';
            player.src = '';

            // 隱藏結果容器
            document.getElementById('mic-result-container').style.display = 'none';
            document.getElementById('mic-translate-container').style.display = 'none';
        }

        // 麥克風翻譯選項切換
        document.addEventListener('DOMContentLoaded', function() {
            const micEnableTranslate = document.getElementById('mic-enable-translate');
            const micLangContainer = document.getElementById('mic-translate-lang-container');
            if (micEnableTranslate && micLangContainer) {
                micEnableTranslate.addEventListener('change', function() {
                    micLangContainer.style.display = this.checked ? 'flex' : 'none';
                });
            }
        });

        // ===== 視覺模型功能 =====
        let visionImageBase64 = null;
        let lastVisionResult = '';

        // 處理視覺模型圖片選擇
        function handleVisionImageSelect(event) {
            const file = event.target.files[0];
            if (file) {
                handleVisionImageFile(file);
            }
        }

        function handleVisionImageFile(file) {
            if (!file.type.startsWith('image/')) {
                alert('請選擇圖片檔案');
                return;
            }

            if (file.size > 20 * 1024 * 1024) {
                alert('圖片大小不能超過 20MB');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                visionImageBase64 = e.target.result;
                const preview = document.getElementById('vision-image-preview');
                const placeholder = document.getElementById('vision-upload-placeholder');
                const previewContainer = document.getElementById('vision-image-preview-container');
                const removeBtn = document.getElementById('remove-vision-image-btn');

                preview.src = visionImageBase64;
                previewContainer.style.display = 'block';
                placeholder.style.display = 'none';
                removeBtn.style.display = 'inline-block';
            };
            reader.readAsDataURL(file);
        }

        // 移除視覺模型圖片
        function removeVisionImage() {
            visionImageBase64 = null;
            const preview = document.getElementById('vision-image-preview');
            const placeholder = document.getElementById('vision-upload-placeholder');
            const previewContainer = document.getElementById('vision-image-preview-container');
            const removeBtn = document.getElementById('remove-vision-image-btn');
            const input = document.getElementById('vision-image-input');

            preview.src = '';
            previewContainer.style.display = 'none';
            placeholder.style.display = 'flex';
            removeBtn.style.display = 'none';
            input.value = '';
        }

        // 設定視覺模型提示詞
        function setVisionPrompt(prompt) {
            document.getElementById('vision-prompt').value = prompt;
        }

        // 分析視覺模型圖片
        async function analyzeVisionImage() {
            if (!visionImageBase64) {
                alert('請先上傳圖片');
                return;
            }

            const prompt = document.getElementById('vision-prompt').value.trim();
            if (!prompt) {
                alert('請輸入提示詞');
                return;
            }

            const resultContainer = document.getElementById('vision-result-container');
            const resultDiv = document.getElementById('vision-result');
            const resultStatus = document.getElementById('vision-result-status');
            const resultTime = document.getElementById('vision-result-time');
            const resultTokens = document.getElementById('vision-result-tokens');

            resultContainer.style.display = 'block';
            resultStatus.textContent = '分析中...';
            resultStatus.classList.add('streaming');
            resultDiv.innerHTML = `
                <div class="vision-notice">
                    <div class="notice-icon">👁️</div>
                    <div class="notice-text">
                        <strong>視覺模型處理中</strong><br>
                        由於視覺模型 (72B 參數) 需要處理圖片資訊，回應時間可能需要 30 秒至 2 分鐘，請耐心等候...
                    </div>
                </div>`;
            resultTime.textContent = '';
            resultTokens.textContent = '';

            const startTime = Date.now();

            try {
                const response = await authFetch(`${API_URL}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'llava:7b',
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', image_url: { url: visionImageBase64 } }
                            ]
                        }],
                        stream: false
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                const elapsed = Date.now() - startTime;

                resultStatus.textContent = '分析完成';
                resultStatus.classList.remove('streaming');
                resultTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;

                if (data.choices && data.choices[0] && data.choices[0].message) {
                    const content = data.choices[0].message.content;
                    const contentLower = content.toLowerCase();

                    // 檢查是否為後端錯誤（推理超時、圖片解碼失敗等）
                    const isBackendError = contentLower.includes('inference timeout') ||
                                           contentLower.includes('failed to decode image') ||
                                           contentLower.includes('llama_model_load') ||
                                           contentLower.includes('ggml_metal_init') ||
                                           (contentLower.includes('error') && content.length > 500);

                    if (isBackendError) {
                        resultStatus.textContent = '服務異常';
                        resultDiv.innerHTML = `
                            <div style="color: #dc3545; margin-bottom: 15px;">
                                <strong>🔧 視覺模型服務異常</strong>
                            </div>
                            <div class="vision-notice" style="background: #fff3cd; border-color: #ffc107;">
                                <div class="notice-icon">⚠️</div>
                                <div class="notice-text">
                                    <strong>問題：</strong> 視覺模型處理圖片時發生錯誤<br><br>
                                    <strong>可能的原因：</strong><br>
                                    • 圖片格式不支援或解碼失敗<br>
                                    • 圖片太大或解析度過高<br>
                                    • 後端服務配置問題<br><br>
                                    <strong>建議：</strong><br>
                                    1. 嘗試使用 JPG 或 PNG 格式的圖片<br>
                                    2. 縮小圖片尺寸後重試<br>
                                    3. 聯繫管理員檢查服務狀態
                                </div>
                            </div>`;
                        return;
                    }

                    lastVisionResult = content;
                    resultDiv.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(content)}</div>`;

                    // 顯示 token 使用量
                    if (data.usage) {
                        resultTokens.textContent = `Tokens: ${data.usage.prompt_tokens || 0} + ${data.usage.completion_tokens || 0} = ${data.usage.total_tokens || 0}`;
                    }
                } else {
                    lastVisionResult = JSON.stringify(data, null, 2);
                    resultDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
                }

            } catch (error) {
                resultStatus.textContent = '分析失敗';
                resultStatus.classList.remove('streaming');

                // 檢查是否為 504 超時錯誤或後端服務問題
                const errorMsg = error.message.toLowerCase();
                if (errorMsg.includes('504') || errorMsg.includes('gateway time-out') || errorMsg.includes('timeout')) {
                    resultDiv.innerHTML = `
                        <div style="color: #dc3545; margin-bottom: 15px;">
                            <strong>⏱️ 視覺模型服務暫時無法使用</strong>
                        </div>
                        <div class="vision-notice" style="background: #fff3cd; border-color: #ffc107;">
                            <div class="notice-icon">🔧</div>
                            <div class="notice-text">
                                <strong>狀態：</strong> LLaVA 7B 模型服務目前回應超時<br><br>
                                <strong>可能的原因：</strong><br>
                                • 本地 Ollama 服務未啟動<br>
                                • GPU 資源忙碌或記憶體不足<br>
                                • 模型正在載入中<br><br>
                                <strong>建議：</strong><br>
                                1. 請稍後再試（等待 1-2 分鐘）<br>
                                2. 確認 Ollama 服務已啟動<br>
                                3. 檢查 GPU 使用狀態 (nvidia-smi)
                            </div>
                        </div>`;
                } else {
                    resultDiv.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(error.message)}</div>`;
                }
            }
        }

        // 複製視覺模型結果
        function copyVisionResult() {
            if (lastVisionResult) {
                navigator.clipboard.writeText(lastVisionResult).then(() => {
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = '✅ 已複製';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 2000);
                });
            }
        }

        // ==================== 歷史紀錄功能 (密碼保護) ====================
        const HISTORY_PASSWORD = '1023';
        let historyAuthenticated = false;
        let historyCurrentPage = 0;
        const historyPageSize = 10;

        // 點擊版本號開啟歷史紀錄頁面
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
        let uploadedAudioFile = null;
        let lastTranslateResult = '';

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

        function handleAudioSelect(event) {
            const file = event.target.files[0];
            if (file) {
                handleAudioFile(file);
            }
        }

        function handleAudioFile(file) {
            if (!file.type.startsWith('audio/')) {
                alert('請選擇音訊檔案');
                return;
            }

            if (file.size > 50 * 1024 * 1024) {
                alert('音訊檔案大小不能超過 50MB');
                return;
            }

            uploadedAudioFile = file;

            const placeholder = document.getElementById('audio-upload-placeholder');
            const fileInfo = document.getElementById('audio-file-info');
            const fileName = document.getElementById('audio-file-name');
            const fileSize = document.getElementById('audio-file-size');
            const removeBtn = document.getElementById('remove-audio-btn');

            placeholder.style.display = 'none';
            fileInfo.style.display = 'block';
            fileName.textContent = file.name;
            fileSize.textContent = formatFileSize(file.size);
            removeBtn.style.display = 'inline-block';
        }

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        function removeAudio() {
            uploadedAudioFile = null;
            const placeholder = document.getElementById('audio-upload-placeholder');
            const fileInfo = document.getElementById('audio-file-info');
            const removeBtn = document.getElementById('remove-audio-btn');
            const input = document.getElementById('audio-input');

            placeholder.style.display = 'flex';
            fileInfo.style.display = 'none';
            removeBtn.style.display = 'none';
            input.value = '';
        }

        async function testSpeechToText() {
            if (!uploadedAudioFile) {
                alert('請先選擇音訊檔案');
                return;
            }

            const container = document.getElementById('speech-result-container');
            const result = document.getElementById('speech-result');
            const status = document.getElementById('speech-status');
            const timeSpan = document.getElementById('speech-time');
            const translateContainer = document.getElementById('translate-result-container');
            const translateResult = document.getElementById('translate-result');
            const translateTargetLang = document.getElementById('translate-target-lang');

            const enableTranslate = document.getElementById('enable-translate').checked;
            const targetLanguage = document.getElementById('target-language').value;

            container.style.display = 'block';
            translateContainer.style.display = 'none';
            status.textContent = '處理中...';
            status.classList.add('streaming');
            result.innerHTML = '<div class="vision-notice"><div class="notice-icon">🎤</div><div class="notice-text"><strong>語音轉文字處理中</strong><br>正在分析音訊內容，請稍候...</div></div>';
            timeSpan.textContent = '';

            const startTime = Date.now();

            try {
                const formData = new FormData();
                formData.append('file', uploadedAudioFile);

                // 如果啟用翻譯，使用 transcribe-and-translate API
                let apiUrl = `${API_URL}/v1/audio/transcriptions`;
                if (enableTranslate) {
                    apiUrl = `${API_URL}/v1/audio/transcribe-and-translate?target_language=${targetLanguage}&model=deepseek-chat`;
                }

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentApiKey}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                const elapsed = Date.now() - startTime;

                status.textContent = enableTranslate ? '轉錄+翻譯完成' : '轉錄完成';
                status.classList.remove('streaming');
                timeSpan.textContent = `${(elapsed / 1000).toFixed(1)}s`;

                // 顯示轉錄結果
                const originalText = enableTranslate ? data.original_text : data.text;
                if (originalText) {
                    lastSpeechResult = originalText;
                    result.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(originalText)}</div>`;
                } else if (originalText === '') {
                    lastSpeechResult = '';
                    result.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">🔇 未偵測到語音內容</div>`;
                } else {
                    lastSpeechResult = JSON.stringify(data, null, 2);
                    result.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
                }

                // 如果啟用翻譯，顯示翻譯結果
                if (enableTranslate && data.translated_text) {
                    lastTranslateResult = data.translated_text;
                    translateContainer.style.display = 'block';
                    translateTargetLang.textContent = data.target_language_name || targetLanguage;
                    translateResult.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(data.translated_text)}</div>`;
                } else if (enableTranslate && data.message) {
                    translateContainer.style.display = 'block';
                    translateTargetLang.textContent = '';
                    translateResult.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">${escapeHtml(data.message)}</div>`;
                }

            } catch (error) {
                status.textContent = '轉錄失敗';
                status.classList.remove('streaming');
                result.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(error.message)}</div>`;
            }
        }

        // 儲存最後的語音轉錄結果
        let lastSpeechResult = '';

        // 複製語音轉錄結果
        function copySpeechResult() {
            if (lastSpeechResult) {
                navigator.clipboard.writeText(lastSpeechResult).then(() => {
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = '✅ 已複製';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 2000);
                });
            }
        }

        // 複製翻譯結果
        function copyTranslateResult() {
            if (lastTranslateResult) {
                navigator.clipboard.writeText(lastTranslateResult).then(() => {
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = '✅ 已複製';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 2000);
                });
            }
        }

        // ===== 模型快速測試功能 =====
        let quickTestModels = [];
        let isTestingAll = false;

        // Provider 引導資訊
        const providerGuides = {
            "llama.cpp": {
                label: "本地部署",
                badgeClass: "local",
                color: "#10b981",
                guide: "本地 llama.cpp 伺服器，無需申請 API Key",
                endpoint: `${window.location.origin}/v1`,
                link: null,
                linkText: null
            },
            "DeepSeek": {
                label: "DeepSeek 雲端",
                badgeClass: "deepseek",
                color: "#3b82f6",
                guide: "需要 DeepSeek API Key",
                endpoint: "https://api.deepseek.com/v1",
                link: "https://platform.deepseek.com/api_keys",
                linkText: "前往 DeepSeek 申請 API Key"
            },
        };

        function getProviderGuide(provider) {
            return providerGuides[provider] || {
                label: provider || "未知",
                badgeClass: "local",
                color: "#64748b",
                guide: "",
                endpoint: "",
                link: null,
                linkText: null
            };
        }

        function toggleProviderGroup(provider) {
            const header = document.querySelector(`.provider-group-header[data-provider="${provider}"]`);
            const body = document.querySelector(`.provider-group-body[data-provider="${provider}"]`);
            if (header && body) {
                header.classList.toggle('collapsed');
                body.classList.toggle('collapsed');
            }
        }

        function toggleApiGuide(index) {
            const guide = document.getElementById(`api-guide-${index}`);
            if (guide) {
                guide.classList.toggle('show');
            }
        }

        function copyEndpoint(text, el) {
            navigator.clipboard.writeText(text).then(() => {
                const original = el.textContent;
                el.textContent = '已複製!';
                el.style.background = '#d1fae5';
                setTimeout(() => {
                    el.textContent = text;
                    el.style.background = '';
                }, 1500);
            });
        }

        // 初始化快速測試模型列表
        document.addEventListener('DOMContentLoaded', function() {
            loadQuickTestModels();
        });

        // 載入模型列表到快速測試區塊
        async function loadQuickTestModels() {
            const grid = document.getElementById('model-test-grid');
            if (!grid) return;

            grid.innerHTML = '<div class="model-test-loading">載入模型列表中...</div>';

            try {
                const response = await authFetch(`${API_URL}/v1/models`);
                const data = await response.json();

                quickTestModels = data.data || [];

                if (quickTestModels.length === 0) {
                    grid.innerHTML = '<div class="model-test-loading">沒有可用的模型</div>';
                    return;
                }

                // 按 provider 分組，保留原始 index
                const groups = {};
                quickTestModels.forEach((model, index) => {
                    const provider = model.owned_by || '未知';
                    if (!groups[provider]) {
                        groups[provider] = [];
                    }
                    groups[provider].push({ model, index });
                });

                // 定義排序順序
                const providerOrder = ['llama.cpp', 'DeepSeek'];
                const sortedProviders = Object.keys(groups).sort((a, b) => {
                    const ia = providerOrder.indexOf(a);
                    const ib = providerOrder.indexOf(b);
                    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                });

                grid.innerHTML = sortedProviders.map(provider => {
                    const guide = getProviderGuide(provider);
                    const models = groups[provider];

                    const cardsHtml = models.map(({ model, index }) => {
                        const apiGuideHtml = `
                            <div class="model-card-api-guide" id="api-guide-${index}">
                                <div class="api-guide-row">
                                    <span class="api-guide-label">📡 API Endpoint:</span>
                                    <span class="api-guide-endpoint" onclick="copyEndpoint('${guide.endpoint}', this)">${guide.endpoint}</span>
                                </div>
                                <div class="api-guide-row">
                                    <span class="api-guide-label">💡</span>
                                    <span>${guide.guide}</span>
                                </div>
                                ${guide.link ? `
                                <div class="api-guide-row">
                                    <a class="api-guide-link" href="${guide.link}" target="_blank" rel="noopener noreferrer">
                                        🔑 ${guide.linkText} →
                                    </a>
                                </div>` : ''}
                            </div>
                        `;

                        return `
                            <div class="model-test-card" id="model-card-${index}" data-model="${model.id}">
                                <div class="model-card-header">
                                    <div class="model-card-name">${model.id}</div>
                                    <span class="model-card-status idle" id="status-${index}">待測試</span>
                                </div>
                                <div class="model-card-info">
                                    來源: <span class="provider-badge ${guide.badgeClass}">${guide.label}</span>
                                </div>
                                <div class="model-card-response" id="response-${index}"></div>
                                <div class="model-card-actions">
                                    <button class="model-card-btn test" id="btn-${index}" onclick="testSingleModel(${index})">
                                        測試此模型
                                    </button>
                                    <button class="model-card-btn api-guide" onclick="toggleApiGuide(${index})">
                                        API 使用說明
                                    </button>
                                </div>
                                ${apiGuideHtml}
                            </div>
                        `;
                    }).join('');

                    return `
                        <div class="provider-group">
                            <div class="provider-group-header" data-provider="${provider}" onclick="toggleProviderGroup('${provider}')">
                                <span class="toggle-icon">▼</span>
                                <span class="provider-badge ${guide.badgeClass}">${guide.label}</span>
                                <span class="provider-group-title">${provider}</span>
                                <span class="provider-model-count">${models.length} 個模型</span>
                            </div>
                            <div class="provider-group-body" data-provider="${provider}">
                                <div class="model-test-grid">
                                    ${cardsHtml}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

            } catch (error) {
                console.error('載入模型失敗:', error);
                grid.innerHTML = `<div class="model-test-loading" style="color: #dc3545;">載入失敗: ${error.message}</div>`;
            }
        }

        // 重新整理模型列表
        function refreshModelList() {
            loadQuickTestModels();
            // 重置統計
            updateTestSummary(0, 0, quickTestModels.length);
            document.getElementById('test-summary').style.display = 'none';
            document.getElementById('test-progress-bar').style.display = 'none';
        }

        // 測試單個模型
        async function testSingleModel(index) {
            const model = quickTestModels[index];
            if (!model) return;

            const card = document.getElementById(`model-card-${index}`);
            const status = document.getElementById(`status-${index}`);
            const response = document.getElementById(`response-${index}`);
            const btn = document.getElementById(`btn-${index}`);

            // 設定為測試中狀態
            card.className = 'model-test-card testing';
            status.className = 'model-card-status testing';
            status.textContent = '測試中...';
            btn.disabled = true;
            response.className = 'model-card-response';
            response.textContent = '';

            const startTime = Date.now();

            try {
                // 發送簡單的測試問題
                const apiResponse = await authFetch(`${API_URL}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model.id,
                        messages: [{ role: 'user', content: '你好，請用一句話回應' }],
                        max_tokens: 50,
                        stream: false
                    })
                });

                const elapsed = Date.now() - startTime;

                if (!apiResponse.ok) {
                    throw new Error(`HTTP ${apiResponse.status}`);
                }

                const data = await apiResponse.json();
                let content = '';

                if (data.choices && data.choices[0] && data.choices[0].message) {
                    content = data.choices[0].message.content;
                }

                // 成功
                card.className = 'model-test-card success';
                status.className = 'model-card-status success';
                status.textContent = `成功 (${(elapsed/1000).toFixed(1)}s)`;
                response.textContent = content.substring(0, 150) + (content.length > 150 ? '...' : '');
                response.className = 'model-card-response show';

                return { success: true, elapsed };

            } catch (error) {
                // 失敗
                card.className = 'model-test-card failed';
                status.className = 'model-card-status failed';
                status.textContent = '失敗';
                response.textContent = error.message;
                response.className = 'model-card-response show';

                return { success: false, error: error.message };

            } finally {
                btn.disabled = false;
            }
        }

        // 測試全部模型
        async function testAllModels() {
            if (isTestingAll) return;
            if (quickTestModels.length === 0) {
                alert('沒有可用的模型');
                return;
            }

            isTestingAll = true;
            const testAllIcon = document.getElementById('test-all-icon');
            testAllIcon.textContent = '⏳';

            // 顯示進度條和摘要
            const progressBar = document.getElementById('test-progress-bar');
            const progressFill = document.getElementById('test-progress-fill');
            const progressText = document.getElementById('test-progress-text');
            const summary = document.getElementById('test-summary');

            progressBar.style.display = 'block';
            summary.style.display = 'flex';
            progressFill.style.width = '0%';

            let successCount = 0;
            let failedCount = 0;
            const total = quickTestModels.length;

            // 重置所有卡片狀態
            for (let i = 0; i < total; i++) {
                const card = document.getElementById(`model-card-${i}`);
                const status = document.getElementById(`status-${i}`);
                const response = document.getElementById(`response-${i}`);
                if (card) card.className = 'model-test-card';
                if (status) {
                    status.className = 'model-card-status idle';
                    status.textContent = '等待中';
                }
                if (response) response.className = 'model-card-response';
            }

            updateTestSummary(0, 0, total);

            // 依序測試每個模型
            for (let i = 0; i < total; i++) {
                progressText.textContent = `${i + 1} / ${total}`;
                progressFill.style.width = `${((i + 1) / total) * 100}%`;

                const result = await testSingleModel(i);

                if (result.success) {
                    successCount++;
                } else {
                    failedCount++;
                }

                updateTestSummary(successCount, failedCount, total - i - 1);

                // 小延遲避免請求過於密集
                if (i < total - 1) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            isTestingAll = false;
            testAllIcon.textContent = '▶️';
        }

        // 更新測試摘要
        function updateTestSummary(success, failed, pending) {
            document.getElementById('success-count').textContent = success;
            document.getElementById('failed-count').textContent = failed;
            document.getElementById('pending-count').textContent = pending;
        }

        // 測試列出模型
        async function testListModels() {
            const responseBox = document.getElementById('models-response');
            responseBox.style.display = 'block';
            responseBox.textContent = '載入中...';

            try {
                const response = await authFetch(`${API_URL}/v1/models`);
                const data = await response.json();
                responseBox.textContent = JSON.stringify(data, null, 2);
                // 同時更新下拉選單
                loadModelOptions();
            } catch (error) {
                responseBox.textContent = `錯誤: ${error.message}`;
            }
        }
        
        // 儲存原始 JSON 回應
        let lastRawResponse = null;
        let lastAIContent = '';

        // 測試聊天完成
        async function testChatCompletion() {
            const model = document.getElementById('model-select').value;
            const systemPrompt = document.getElementById('system-prompt').value;
            const userMessage = document.getElementById('user-message').value;
            const streamMode = document.getElementById('stream-mode').checked;

            // 取得模型名稱
            const selectedModel = modelsData.find(m => m.id === model);
            const modelName = selectedModel?.info?.name || model;

            // 顯示 AI 回覆容器
            const container = document.getElementById('ai-response-container');
            const aiContent = document.getElementById('ai-content');
            const aiModelName = document.getElementById('ai-model-name');
            const aiStatus = document.getElementById('ai-status');
            const aiTokens = document.getElementById('ai-tokens');
            const aiTime = document.getElementById('ai-time');
            const rawJson = document.getElementById('raw-json');
            const rawResponse = document.getElementById('raw-response');

            container.style.display = 'block';
            aiModelName.textContent = modelName;
            aiStatus.classList.add('streaming');
            aiTokens.textContent = '';
            aiTime.textContent = '';
            rawResponse.style.display = 'none';
            lastRawResponse = null;
            lastAIContent = '';

            const startTime = Date.now();

            // 構建訊息內容 (支援視覺模型的圖片)
            let userContent;
            const isVisionModel = model && (model.toLowerCase().includes('vl') || model.toLowerCase().includes('vision'));

            // 根據模型類型顯示不同的提示訊息
            if (isVisionModel) {
                aiStatus.textContent = '處理中（視覺模型需要較長時間）...';
                aiContent.innerHTML = `
                    <div class="vision-notice">
                        <div class="notice-icon">🖼️</div>
                        <div class="notice-text">
                            <strong>視覺模型處理中</strong><br>
                            由於視覺模型 (72B 參數) 需要處理圖片資訊，回應時間可能需要 30 秒至 2 分鐘，請耐心等候...
                        </div>
                    </div>
                    <span class="typing-cursor"></span>
                `;
            } else {
                aiStatus.textContent = '思考中...';
                aiContent.innerHTML = '<span class="typing-cursor"></span>';
            }

            if (isVisionModel && uploadedImageBase64) {
                // 視覺模型帶圖片的請求格式
                userContent = [
                    {
                        type: "image_url",
                        image_url: {
                            url: uploadedImageBase64
                        }
                    },
                    {
                        type: "text",
                        text: userMessage
                    }
                ];
            } else {
                userContent = userMessage;
            }

            const requestBody = {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                stream: streamMode,
                temperature: 0.7
            };

            try {
                if (streamMode) {
                    // 串流模式
                    const response = await authFetch(`${API_URL}/v1/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(requestBody)
                    });

                    // 檢查回應狀態
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let fullContent = '';
                    let totalTokens = 0;
                    let lastChunkData = null;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data.trim() === '[DONE]') continue;

                                try {
                                    const json = JSON.parse(data);
                                    lastChunkData = json;
                                    if (json.choices?.[0]?.delta?.content) {
                                        fullContent += json.choices[0].delta.content;
                                        aiContent.innerHTML = formatMarkdown(fullContent) + '<span class="typing-cursor"></span>';
                                        // 自動滾動到底部
                                        aiContent.scrollTop = aiContent.scrollHeight;
                                    }
                                    if (json.usage) {
                                        totalTokens = json.usage.total_tokens || 0;
                                    }
                                } catch (e) {}
                            }
                        }
                    }

                    // 完成後更新狀態
                    const elapsed = Date.now() - startTime;
                    lastAIContent = fullContent;
                    aiContent.innerHTML = formatMarkdown(fullContent);
                    aiStatus.textContent = '回覆完成';
                    aiStatus.classList.remove('streaming');
                    aiTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;
                    if (totalTokens > 0) {
                        aiTokens.textContent = `${totalTokens} tokens`;
                    }
                    lastRawResponse = { streaming: true, content: fullContent, lastChunk: lastChunkData };
                    rawJson.textContent = JSON.stringify(lastRawResponse, null, 2);

                } else {
                    // 一般模式
                    const response = await authFetch(`${API_URL}/v1/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(requestBody)
                    });

                    // 檢查回應狀態
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                    }

                    const data = await response.json();
                    const elapsed = Date.now() - startTime;

                    lastRawResponse = data;
                    rawJson.textContent = JSON.stringify(data, null, 2);

                    if (data.choices?.[0]?.message?.content) {
                        const content = data.choices[0].message.content;
                        lastAIContent = content;
                        aiContent.innerHTML = formatMarkdown(content);
                        aiStatus.textContent = '回覆完成';
                        aiStatus.classList.remove('streaming');

                        if (data.usage) {
                            aiTokens.textContent = `${data.usage.total_tokens} tokens`;
                        }
                        aiTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;
                    } else if (data.error) {
                        aiContent.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(data.error.message || JSON.stringify(data.error))}</div>`;
                        aiStatus.textContent = '發生錯誤';
                        aiStatus.classList.remove('streaming');
                    }
                }
            } catch (error) {
                aiContent.innerHTML = `<div style="color: #dc3545;">❌ 連接錯誤: ${escapeHtml(error.message)}</div>`;
                aiStatus.textContent = '連接失敗';
                aiStatus.classList.remove('streaming');
            }
        }

        // 複製 AI 回覆
        function copyAIResponse(btn) {
            // 複製清理後的內容
            const cleanedContent = cleanModelOutput(lastAIContent);
            if (cleanedContent) {
                navigator.clipboard.writeText(cleanedContent).then(() => {
                    const originalText = btn.textContent;
                    btn.textContent = '✅ 已複製!';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 2000);
                }).catch(err => {
                    alert('複製失敗: ' + err.message);
                });
            } else {
                alert('沒有可複製的內容');
            }
        }

        // 切換原始 JSON 顯示
        function toggleRawResponse() {
            const rawDiv = document.getElementById('raw-response');
            if (rawDiv.style.display === 'none') {
                rawDiv.style.display = 'block';
            } else {
                rawDiv.style.display = 'none';
            }
        }

        // 清理模型內部標記，只保留最終回覆
        function cleanModelOutput(text) {
            if (!text) return '';

            // 首先過濾掉後端伺服器的技術日誌訊息
            let cleaned = text;

            // 過濾模型載入和圖片處理的日誌訊息
            const logPatterns = [
                /main: loading model:.*?\n?/g,
                /encoding image slice\.{3}\n?/g,
                /image slice encoded in \d+ ms\n?/g,
                /decoding image batch \d+\/\d+, n_tokens_batch = \d+\n?/g,
                /image decoded \(batch \d+\/\d+\) in \d+ ms\n?/g,
                /llama_model_loader:.*?\n?/g,
                /llm_load_.*?:.*?\n?/g,
                /sampler seed:.*?\n?/g,
                /sampler params:.*?\n?/g,
                /sampler chain:.*?\n?/g,
                /generate:.*?\n?/g,
            ];

            for (const pattern of logPatterns) {
                cleaned = cleaned.replace(pattern, '');
            }
            cleaned = cleaned.trim();

            // 方法1: 嘗試提取 <|channel|>final<|message|> 後的內容
            const finalMatch = cleaned.match(/<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/);
            if (finalMatch) {
                return finalMatch[1].trim();
            }

            // 方法2: 如果有 assistant<|channel|>final 的格式
            const assistantMatch = cleaned.match(/assistant<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/);
            if (assistantMatch) {
                return assistantMatch[1].trim();
            }

            // 方法3: 尋找最後一個 <|message|> 之後的內容 (可能是最終回覆)
            const parts = cleaned.split(/<\|message\|>/);
            if (parts.length > 1) {
                // 取最後一部分，並移除結尾標記
                let lastPart = parts[parts.length - 1];
                lastPart = lastPart.replace(/<\|end\|>[\s\S]*/g, '').trim();
                // 確認這不是 analysis 內容（通常 analysis 很長且包含英文思考）
                if (lastPart.length > 0 && !lastPart.startsWith('The user')) {
                    return lastPart;
                }
            }

            // 方法4: 移除所有標記格式的內容
            // 移除 <|channel|>analysis<|message|>...直到下一個<|end|>或<|start|>
            cleaned = cleaned.replace(/<\|channel\|>analysis<\|message\|>[\s\S]*?(?=<\|end\|>|<\|start\|>|$)/g, '');
            // 移除剩餘的標記
            cleaned = cleaned.replace(/<\|[^|>]+\|>/g, '');
            cleaned = cleaned.trim();

            return cleaned || text;
        }

        // Markdown 格式化
        function formatMarkdown(text) {
            if (!text) return '';

            // 首先清理模型內部標記
            text = cleanModelOutput(text);

            // 先處理程式碼區塊 (避免內部被其他規則處理)
            const codeBlocks = [];
            text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
                const index = codeBlocks.length;
                codeBlocks.push({ lang, code: code.trim() });
                return `__CODE_BLOCK_${index}__`;
            });

            // 處理表格
            const tableRegex = /^\|(.+)\|$/gm;
            const lines = text.split('\n');
            let inTable = false;
            let tableHtml = '';
            let tableRows = [];
            let processedLines = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('|') && line.endsWith('|')) {
                    if (!inTable) {
                        inTable = true;
                        tableRows = [];
                    }
                    // 跳過分隔行 (如 |---|---|---|)
                    if (!/^\|[\s\-:]+\|$/.test(line)) {
                        tableRows.push(line);
                    }
                } else {
                    if (inTable) {
                        // 結束表格，生成 HTML
                        processedLines.push(generateTableHtml(tableRows));
                        inTable = false;
                        tableRows = [];
                    }
                    processedLines.push(line);
                }
            }
            // 處理最後一個表格
            if (inTable && tableRows.length > 0) {
                processedLines.push(generateTableHtml(tableRows));
            }
            text = processedLines.join('\n');

            // 行內程式碼
            text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

            // 標題
            text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
            text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
            text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

            // 粗體和斜體
            text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

            // 引用區塊
            text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

            // 無序清單
            text = text.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
            text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

            // 有序清單
            text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

            // 水平線
            text = text.replace(/^---$/gm, '<hr>');

            // 連結
            text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

            // 還原程式碼區塊
            text = text.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
                const block = codeBlocks[parseInt(index)];
                const langLabel = block.lang ? `<span style="position:absolute;top:5px;right:10px;color:#888;font-size:11px;">${block.lang}</span>` : '';
                return `<pre style="position:relative;">${langLabel}<code>${escapeHtml(block.code)}</code></pre>`;
            });

            // 段落 (換行處理)
            text = text.replace(/\n\n/g, '</p><p>');
            text = text.replace(/\n/g, '<br>');

            // 包裝段落
            if (!text.startsWith('<')) {
                text = '<p>' + text + '</p>';
            }

            // 清理空標籤
            text = text.replace(/<p><\/p>/g, '');
            text = text.replace(/<p><br><\/p>/g, '');

            return text;
        }

        // 生成表格 HTML
        function generateTableHtml(rows) {
            if (rows.length === 0) return '';

            let html = '<table class="md-table">';

            rows.forEach((row, index) => {
                const cells = row.split('|').filter(cell => cell.trim() !== '');
                const tag = index === 0 ? 'th' : 'td';
                const rowTag = index === 0 ? 'thead' : (index === 1 ? 'tbody' : '');

                if (index === 0) html += '<thead>';
                if (index === 1) html += '<tbody>';

                html += '<tr>';
                cells.forEach(cell => {
                    html += `<${tag}>${cell.trim()}</${tag}>`;
                });
                html += '</tr>';

                if (index === 0) html += '</thead>';
            });

            if (rows.length > 1) html += '</tbody>';
            html += '</table>';

            return html;
        }
        
        // 複製程式碼
        function copyCode(button) {
            const codeBlock = button.parentElement.querySelector('pre');
            const text = codeBlock.textContent;
            
            navigator.clipboard.writeText(text).then(() => {
                const originalText = button.textContent;
                button.textContent = '已複製!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            });
        }
        
        // 載入統計數據
        async function loadStats() {
            try {
                const response = await authFetch(`${API_URL}/api/stats`);
                const data = await response.json();

                // 更新摘要卡片
                document.getElementById('stat-total-requests').textContent =
                    data.summary.total_requests.toLocaleString();
                document.getElementById('stat-success-rate').textContent =
                    data.summary.success_rate + '%';
                document.getElementById('stat-avg-response').textContent =
                    data.summary.avg_response_time_ms.toFixed(0) + 'ms';
                document.getElementById('stat-total-tokens').textContent =
                    data.summary.total_tokens.toLocaleString();
                document.getElementById('stat-prompt-tokens').textContent =
                    data.summary.total_tokens_prompt.toLocaleString();
                document.getElementById('stat-completion-tokens').textContent =
                    data.summary.total_tokens_completion.toLocaleString();
                document.getElementById('stat-errors').textContent =
                    data.summary.errors_count.toLocaleString();

                // 繪製模型使用圖表
                renderBarChart('model-usage-chart', data.by_model, '次');

                // 繪製每日趨勢圖表
                renderBarChart('daily-chart', data.by_date, '次');

            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        }

        // 繪製長條圖
        function renderBarChart(containerId, data, unit) {
            const container = document.getElementById(containerId);
            const entries = Object.entries(data);

            if (entries.length === 0) {
                container.innerHTML = '<p class="empty-state">暫無數據</p>';
                return;
            }

            const maxValue = Math.max(...entries.map(([, v]) => v));

            container.innerHTML = entries.map(([label, value]) => {
                const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
                return `
                    <div class="chart-bar">
                        <div class="chart-label" title="${label}">${label}</div>
                        <div class="chart-bar-wrapper">
                            <div class="chart-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <div class="chart-value">${value}${unit}</div>
                    </div>
                `;
            }).join('');
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
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ===== OCR 文件辨識功能 =====
        let ocrUploadedFile = null;
        let ocrSelectedModel = 'llava-ocr';
        let ocrResultData = {};
        let ocrMethodMode = 'ppocrv5';  // 'ppocrv5' 或 'vision'
        let ocrImageBase64 = null;  // 用於視覺模型的 base64 圖片

        // 初始化 OCR 功能
        document.addEventListener('DOMContentLoaded', function() {
            const uploadArea = document.getElementById('ocr-upload-area');
            const fileInput = document.getElementById('ocr-input');

            if (uploadArea && fileInput) {
                // 點擊上傳
                uploadArea.addEventListener('click', () => fileInput.click());

                // 檔案選擇
                fileInput.addEventListener('change', handleOcrFileSelect);

                // 拖放支援
                uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploadArea.classList.add('dragover');
                });

                uploadArea.addEventListener('dragleave', () => {
                    uploadArea.classList.remove('dragover');
                });

                uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploadArea.classList.remove('dragover');
                    const file = e.dataTransfer.files[0];
                    if (file) processOcrFile(file);
                });
            }

            // 載入 OCR 模型列表
            loadOcrModels();
        });

        // OCR 模型資料快取
        let ocrModelsData = [];

        // 載入 OCR 模型列表
        async function loadOcrModels() {
            const modelSelect = document.getElementById('ocr-model-select');
            if (!modelSelect) return;

            try {
                const response = await authFetch(`${API_URL}/v1/ocr/models`);
                const data = await response.json();
                ocrModelsData = data.models;

                modelSelect.innerHTML = '';
                data.models.forEach((model, index) => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = model.name + (model.available ? '' : ' (離線)');
                    option.disabled = !model.available;
                    option.dataset.description = model.description;
                    option.dataset.features = model.features.join('、');
                    option.dataset.bestFor = model.best_for;

                    if (index === 0) {
                        option.selected = true;
                        ocrSelectedModel = model.id;
                    }

                    modelSelect.appendChild(option);
                });

                // 顯示第一個模型的描述
                updateOcrModelDescription(ocrModelsData[0]);
            } catch (error) {
                console.error('載入 OCR 模型失敗:', error);
                modelSelect.innerHTML = '<option value="">載入失敗，請重新整理</option>';
            }
        }

        // 模型選擇變更處理
        function onOcrModelChange(select) {
            ocrSelectedModel = select.value;
            const model = ocrModelsData.find(m => m.id === select.value);
            if (model) {
                updateOcrModelDescription(model);
            }
        }

        // 更新模型描述顯示
        function updateOcrModelDescription(model) {
            const descEl = document.getElementById('ocr-model-desc');
            if (descEl && model) {
                descEl.innerHTML = `
                    <strong>${model.description}</strong><br>
                    <span style="color: #1967d2;">特點：${model.features.join('、')}</span><br>
                    <span style="color: #28a745;">適用：${model.best_for}</span>
                `;
            }
        }

        // 切換 OCR 辨識方式
        function switchOcrMethod(method) {
            ocrMethodMode = method;

            // 更新按鈕狀態
            const buttons = document.querySelectorAll('.ocr-method-btn');
            buttons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.method === method);
            });

            // 切換設定區塊顯示
            const ppocrvSettings = document.getElementById('ppocrv5-settings');
            const deepseekSettings = document.getElementById('deepseek-settings');
            const visionSettings = document.getElementById('vision-settings');
            const languageGroup = document.querySelector('#ppocrv5-settings').parentElement.querySelector('.ocr-setting-group:nth-of-type(3)'); // 語言選擇區塊
            const formatGroup = document.querySelector('#ppocrv5-settings').parentElement.querySelector('.ocr-setting-group:nth-of-type(4)'); // 輸出格式區塊

            // 隱藏所有設定
            ppocrvSettings.style.display = 'none';
            deepseekSettings.style.display = 'none';
            visionSettings.style.display = 'none';
            if (languageGroup) languageGroup.style.display = 'none';
            if (formatGroup) formatGroup.style.display = 'none';

            if (method === 'ppocrv5') {
                ppocrvSettings.style.display = 'block';
                if (languageGroup) languageGroup.style.display = 'block';
                if (formatGroup) formatGroup.style.display = 'block';
            } else if (method === 'deepseek') {
                deepseekSettings.style.display = 'block';
            } else if (method === 'vision') {
                visionSettings.style.display = 'block';
            }
        }

        // 設定視覺模型提示詞
        function setOcrVisionPrompt(prompt) {
            const textarea = document.getElementById('ocr-vision-prompt');
            if (textarea) {
                textarea.value = prompt;
            }
        }

        // 處理 OCR 檔案選擇
        function handleOcrFileSelect(event) {
            const file = event.target.files[0];
            if (file) processOcrFile(file);
        }

        // 處理 OCR 檔案
        function processOcrFile(file) {
            // 驗證檔案類型
            const isImage = file.type.startsWith('image/');
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

            if (!isImage && !isPdf) {
                alert('請選擇圖片檔案（JPG、PNG、GIF、WebP、BMP）或 PDF 檔案');
                return;
            }

            // 驗證檔案大小 (20MB)
            if (file.size > 20 * 1024 * 1024) {
                alert('檔案大小不能超過 20MB');
                return;
            }

            ocrUploadedFile = file;

            const preview = document.getElementById('ocr-preview');
            const pdfPreview = document.getElementById('ocr-pdf-preview');
            const placeholder = document.getElementById('ocr-upload-placeholder');
            const uploadArea = document.getElementById('ocr-upload-area');
            const fileInfo = document.getElementById('ocr-file-info');

            // 隱藏所有預覽
            preview.style.display = 'none';
            pdfPreview.style.display = 'none';
            placeholder.style.display = 'none';
            uploadArea.classList.add('has-file');

            if (isPdf) {
                // PDF 檔案預覽
                pdfPreview.style.display = 'block';
                document.getElementById('ocr-pdf-name').textContent = file.name;
                ocrImageBase64 = null; // PDF 不使用 base64 預覽

                // 顯示檔案資訊
                document.getElementById('ocr-file-name').textContent = file.name;
                document.getElementById('ocr-file-size').textContent = formatFileSize(file.size);
                fileInfo.style.display = 'block';

                // 啟用辨識按鈕
                document.getElementById('ocr-start-btn').disabled = false;
            } else {
                // 圖片檔案預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';

                    // 保存 base64 給視覺模型使用
                    ocrImageBase64 = e.target.result;

                    // 顯示檔案資訊
                    document.getElementById('ocr-file-name').textContent = file.name;
                    document.getElementById('ocr-file-size').textContent = formatFileSize(file.size);
                    fileInfo.style.display = 'block';

                    // 啟用辨識按鈕
                    document.getElementById('ocr-start-btn').disabled = false;
                };
                reader.readAsDataURL(file);
            }
        }

        // 清除 OCR 檔案
        function clearOcrFile() {
            ocrUploadedFile = null;
            ocrImageBase64 = null;
            const preview = document.getElementById('ocr-preview');
            const pdfPreview = document.getElementById('ocr-pdf-preview');
            const placeholder = document.getElementById('ocr-upload-placeholder');
            const uploadArea = document.getElementById('ocr-upload-area');
            const fileInfo = document.getElementById('ocr-file-info');
            const fileInput = document.getElementById('ocr-input');

            preview.style.display = 'none';
            preview.src = '';
            pdfPreview.style.display = 'none';
            placeholder.style.display = 'flex';
            uploadArea.classList.remove('has-file');
            fileInfo.style.display = 'none';
            fileInput.value = '';

            // 停用辨識按鈕
            document.getElementById('ocr-start-btn').disabled = true;
        }

        // 開始 OCR 辨識
        async function startOcrRecognition() {
            if (!ocrUploadedFile) {
                alert('請先上傳圖片檔案');
                return;
            }

            const btn = document.getElementById('ocr-start-btn');
            const btnText = document.getElementById('ocr-btn-text');
            const btnLoading = document.getElementById('ocr-btn-loading');

            // 更新按鈕狀態
            btn.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';

            const startTime = Date.now();

            try {
                let result;

                if (ocrMethodMode === 'vision') {
                    // 使用視覺模型 (LLaVA)
                    result = await performVisionOcr(startTime);
                } else if (ocrMethodMode === 'deepseek') {
                    // 使用 DeepSeek OCR
                    result = await performDeepSeekOcr(startTime);
                } else {
                    // 使用傳統 PP-OCR
                    result = await performPpOcr(startTime);
                }

                ocrResultData = result;
                displayOcrResult(result);

            } catch (error) {
                console.error('OCR 辨識錯誤:', error);
                alert('辨識失敗: ' + error.message);
            } finally {
                // 恢復按鈕狀態
                btn.disabled = false;
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
            }
        }

        // 使用傳統 PP-OCR 辨識
        async function performPpOcr(startTime) {
            // 取得輸出格式
            const formats = [];
            if (document.getElementById('ocr-format-text').checked) formats.push('text');
            if (document.getElementById('ocr-format-json').checked) formats.push('json');
            if (document.getElementById('ocr-format-markdown').checked) formats.push('markdown');
            const outputFormat = formats.length > 1 ? 'all' : (formats[0] || 'text');

            const language = document.getElementById('ocr-language').value;

            const formData = new FormData();
            formData.append('file', ocrUploadedFile);
            formData.append('model', ocrSelectedModel);
            formData.append('output_format', outputFormat);
            formData.append('language', language);

            const response = await authFetch(`${API_URL}/v1/ocr/recognize`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const text = await response.text();
                try {
                    const error = JSON.parse(text);
                    throw new Error(error.detail || 'OCR 辨識失敗');
                } catch (e) {
                    throw new Error(`OCR 辨識失敗 (${response.status}): ${text.substring(0, 100)}`);
                }
            }

            return await response.json();
        }

        // 使用 DeepSeek OCR 辨識
        async function performDeepSeekOcr(startTime) {
            const language = document.getElementById('deepseek-language').value;

            const formData = new FormData();
            formData.append('file', ocrUploadedFile);
            formData.append('model', 'deepseek-ocr');
            formData.append('output_format', 'all');
            formData.append('language', language);

            const response = await authFetch(`${API_URL}/v1/ocr/recognize`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const text = await response.text();
                try {
                    const error = JSON.parse(text);
                    throw new Error(error.detail || 'DeepSeek OCR 辨識失敗');
                } catch (e) {
                    throw new Error(`DeepSeek OCR 辨識失敗 (${response.status}): ${text.substring(0, 100)}`);
                }
            }

            return await response.json();
        }

        // 使用視覺模型辨識
        async function performVisionOcr(startTime) {
            if (!ocrImageBase64) {
                throw new Error('圖片資料未載入，請重新上傳圖片');
            }

            const prompt = document.getElementById('ocr-vision-prompt').value.trim();
            if (!prompt) {
                throw new Error('請輸入分析提示詞');
            }

            const response = await authFetch(`${API_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llava:7b',
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: ocrImageBase64 } }
                        ]
                    }],
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`視覺模型回應錯誤: ${errorText}`);
            }

            const data = await response.json();
            const elapsed = Date.now() - startTime;

            // 取得回應文字
            let textContent = '';
            if (data.choices && data.choices[0] && data.choices[0].message) {
                textContent = data.choices[0].message.content;
            }

            // 轉換為 OCR 結果格式
            return {
                success: true,
                text: textContent,
                confidence: 0.95,  // 視覺模型無信心度，給預設值
                char_count: textContent.length,
                processing_time_ms: elapsed,
                model: 'llava:7b',
                model_name: 'LLaVA 7B 視覺模型',
                result: {
                    text: textContent,
                    prompt: prompt
                }
            };
        }

        // 顯示 OCR 結果
        function displayOcrResult(result) {
            const placeholder = document.getElementById('ocr-result-placeholder');
            const tabs = document.getElementById('ocr-result-tabs');
            const downloadGroup = document.getElementById('ocr-download-group');
            const stats = document.getElementById('ocr-stats');

            // 隱藏佔位符，顯示結果
            placeholder.style.display = 'none';
            tabs.style.display = 'flex';
            downloadGroup.style.display = 'flex';
            stats.style.display = 'flex';

            // 填充結果內容
            const textOutput = document.getElementById('ocr-text-output');
            const jsonOutput = document.getElementById('ocr-json-output');
            const markdownOutput = document.getElementById('ocr-markdown-output');

            // 純文字
            const textContent = result.text || (result.result && result.result.text) || '';
            textOutput.textContent = textContent;

            // JSON
            const jsonContent = result.result || { text: textContent, confidence: result.confidence, char_count: result.char_count };
            jsonOutput.textContent = JSON.stringify(jsonContent, null, 2);

            // Markdown
            const markdownContent = result.markdown || textContent;
            markdownOutput.innerHTML = markdownToHtml(markdownContent);

            // 統計資訊
            document.getElementById('ocr-time').textContent = (result.processing_time_ms / 1000).toFixed(2) + 's';
            document.getElementById('ocr-confidence').textContent = (result.confidence * 100).toFixed(1) + '%';
            document.getElementById('ocr-chars').textContent = result.char_count.toLocaleString();
            document.getElementById('ocr-model-used').textContent = result.model_name || result.model;

            // 顯示純文字結果
            switchOcrResultTab('text');
        }

        // 簡單的 Markdown 轉 HTML
        function markdownToHtml(md) {
            if (!md) return '';
            return md
                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/^/, '<p>')
                .replace(/$/, '</p>');
        }

        // 切換 OCR 結果標籤頁
        function switchOcrResultTab(tab) {
            const tabs = document.querySelectorAll('.ocr-tab');
            const contents = document.querySelectorAll('.ocr-result-content');

            tabs.forEach(t => {
                t.classList.remove('active');
                if (t.textContent.includes(tab === 'text' ? '純文字' : tab === 'json' ? 'JSON' : 'Markdown')) {
                    t.classList.add('active');
                }
            });

            contents.forEach(c => c.style.display = 'none');
            document.getElementById(`ocr-result-${tab}`).style.display = 'block';
        }

        // 下載 OCR 結果
        function downloadOcrResult() {
            const format = document.getElementById('ocr-download-format').value;
            let content, filename, mimeType;

            const textContent = ocrResultData.text || (ocrResultData.result && ocrResultData.result.text) || '';

            switch (format) {
                case 'txt':
                    content = textContent;
                    filename = 'ocr_result.txt';
                    mimeType = 'text/plain';
                    break;
                case 'json':
                    content = JSON.stringify(ocrResultData.result || { text: textContent }, null, 2);
                    filename = 'ocr_result.json';
                    mimeType = 'application/json';
                    break;
                case 'md':
                    content = ocrResultData.markdown || textContent;
                    filename = 'ocr_result.md';
                    mimeType = 'text/markdown';
                    break;
            }

            const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // ========== System User Management ==========

        async function loadSystemUsers() {
            const listDiv = document.getElementById('system-users-list');
            listDiv.innerHTML = '<p style="color: #999; text-align: center;">載入中...</p>';

            try {
                const response = await authFetch(`${API_URL}/api/system-users`);
                if (!response.ok) throw new Error('Failed to load users');
                const users = await response.json();

                if (users.length === 0) {
                    listDiv.innerHTML = '<p style="color: #999; text-align: center;">尚無使用者</p>';
                    return;
                }

                let html = `<table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #ddd; text-align: left;">
                            <th style="padding: 10px;">ID</th>
                            <th style="padding: 10px;">帳號</th>
                            <th style="padding: 10px;">權限</th>
                            <th style="padding: 10px;">狀態</th>
                            <th style="padding: 10px;">建立時間</th>
                            <th style="padding: 10px;">操作</th>
                        </tr>
                    </thead>
                    <tbody>`;

                users.forEach(u => {
                    const adminBadge = u.is_admin
                        ? '<span style="background: #ffc107; color: #000; padding: 2px 8px; border-radius: 10px; font-size: 12px;">管理員</span>'
                        : '<span style="background: #e0e0e0; color: #666; padding: 2px 8px; border-radius: 10px; font-size: 12px;">一般</span>';
                    const statusBadge = u.is_active
                        ? '<span style="color: #28a745;">✅ 啟用</span>'
                        : '<span style="color: #dc3545;">⛔ 停用</span>';

                    html += `<tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px;">${u.id}</td>
                        <td style="padding: 10px; font-weight: bold;">${u.username}</td>
                        <td style="padding: 10px;">${adminBadge}</td>
                        <td style="padding: 10px;">${statusBadge}</td>
                        <td style="padding: 10px; color: #666; font-size: 13px;">${u.created_at}</td>
                        <td style="padding: 10px;">
                            <button class="btn" style="padding: 4px 10px; font-size: 12px; margin-right: 5px;" onclick="toggleUserAdmin(${u.id}, ${!u.is_admin})">${u.is_admin ? '取消管理員' : '設為管理員'}</button>
                            <button class="btn ${u.is_active ? 'btn-secondary' : 'btn-primary'}" style="padding: 4px 10px; font-size: 12px; margin-right: 5px;" onclick="toggleUserActive(${u.id}, ${!u.is_active})">${u.is_active ? '停用' : '啟用'}</button>
                            <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteSystemUser(${u.id}, '${u.username}')">刪除</button>
                        </td>
                    </tr>`;
                });

                html += '</tbody></table>';
                listDiv.innerHTML = html;
            } catch (e) {
                listDiv.innerHTML = '<p style="color: #dc3545; text-align: center;">載入失敗</p>';
                console.error('Failed to load system users:', e);
            }
        }

        async function createSystemUser() {
            const username = document.getElementById('new-sys-username').value.trim();
            const password = document.getElementById('new-sys-password').value.trim();
            const isAdmin = document.getElementById('new-sys-admin').checked;

            if (!username || !password) {
                alert('請輸入帳號和密碼');
                return;
            }

            try {
                const response = await authFetch(`${API_URL}/api/system-users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, is_admin: isAdmin })
                });

                if (response.ok) {
                    document.getElementById('new-sys-username').value = '';
                    document.getElementById('new-sys-password').value = '';
                    document.getElementById('new-sys-admin').checked = false;
                    loadSystemUsers();
                } else {
                    const err = await response.json().catch(() => null);
                    alert(err?.detail || '新增失敗');
                }
            } catch (e) {
                alert('新增失敗：' + e.message);
            }
        }

        async function toggleUserAdmin(userId, isAdmin) {
            try {
                const response = await authFetch(`${API_URL}/api/system-users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_admin: isAdmin })
                });
                if (response.ok) loadSystemUsers();
                else alert('更新失敗');
            } catch (e) {
                alert('更新失敗：' + e.message);
            }
        }

        async function toggleUserActive(userId, isActive) {
            try {
                const response = await authFetch(`${API_URL}/api/system-users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: isActive })
                });
                if (response.ok) loadSystemUsers();
                else alert('更新失敗');
            } catch (e) {
                alert('更新失敗：' + e.message);
            }
        }

        async function deleteSystemUser(userId, username) {
            if (!confirm(`確定要刪除使用者「${username}」嗎？`)) return;

            try {
                const response = await authFetch(`${API_URL}/api/system-users/${userId}`, {
                    method: 'DELETE'
                });
                if (response.ok) loadSystemUsers();
                else alert('刪除失敗');
            } catch (e) {
                alert('刪除失敗：' + e.message);
            }
        }

        // 頁面載入時檢查狀態
        window.addEventListener('load', () => {
            checkStatusEnhanced();
            loadStats();
            loadConversations();
            loadModelOptions();
            // 啟動自動刷新（每30秒）
            startAutoRefresh();
            // 每60秒更新統計
            setInterval(loadStats, 60000);
        });