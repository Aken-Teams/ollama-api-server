// ==========================================================================
// AUTH MODULE
// ==========================================================================

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
        // 偵測舊的 master key，強制重新登入
        if (currentApiKey === 'pj-admin-zhpjaiaoi-2024') {
            console.log('Master key detected, forcing re-login');
            clearSession();
            showLoginPage();
            return false;
        }

        // Restore user from localStorage
        try {
            const savedUser = localStorage.getItem('pj_user');
            if (savedUser) currentUser = JSON.parse(savedUser);
            currentRole = localStorage.getItem('pj_role') || null;
        } catch (e) {}

        // Verify session is still valid
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
        clearSession();
    }
    showLoginPage();
    return false;
}

// Handle login form submit
async function handleLogin(event) {
    event.preventDefault();

    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

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
            currentRole = data.user.is_admin ? 'admin' : 'user';

            localStorage.setItem('pj_authenticated', 'true');
            localStorage.setItem('pj_api_key', data.api_key);
            localStorage.setItem('pj_user', JSON.stringify(data.user));
            localStorage.setItem('pj_role', currentRole);

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

function clearSession() {
    localStorage.removeItem('pj_authenticated');
    localStorage.removeItem('pj_api_key');
    localStorage.removeItem('pj_user');
    localStorage.removeItem('pj_role');
    isAuthenticated = false;
    currentApiKey = '';
    currentUser = null;
    currentRole = null;
}

// Handle logout
function handleLogout() {
    clearSession();
    showLoginPage();
}

// Show login page
function showLoginPage() {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('visible');
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
}

// Show main content
function showMainContent() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('main-content').classList.add('visible');
    if (typeof stopOrbitalAnimation === 'function') stopOrbitalAnimation();

    const isAdmin = currentRole === 'admin';

    // Update user info display in sidebar
    const usernameEl = document.getElementById('current-username');
    const badgeEl = document.getElementById('admin-badge');
    const adminNav = document.getElementById('admin-nav');
    const sysconfigNav = document.getElementById('sysconfig-nav');
    // Also update hidden compat tabs for any code that references them
    const adminTab = document.getElementById('admin-tab');
    const sysconfigTab = document.getElementById('sysconfig-tab');

    if (currentUser && currentUser.username) {
        usernameEl.textContent = currentUser.username;
    } else {
        usernameEl.textContent = isAdmin ? '管理員' : '使用者';
    }

    if (isAdmin) {
        badgeEl.style.display = 'inline';
        badgeEl.textContent = '管理員';
        badgeEl.className = 'role-badge';
        if (adminNav) adminNav.style.display = 'block';
        if (sysconfigNav) sysconfigNav.style.display = 'block';
        if (adminTab) adminTab.style.display = 'block';
        if (sysconfigTab) sysconfigTab.style.display = 'block';
    } else {
        badgeEl.style.display = 'inline';
        badgeEl.textContent = '使用者';
        badgeEl.className = 'role-badge user-role';
        if (adminNav) adminNav.style.display = 'none';
        if (sysconfigNav) sysconfigNav.style.display = 'none';
        if (adminTab) adminTab.style.display = 'none';
        if (sysconfigTab) sysconfigTab.style.display = 'none';
    }

    // Load initial data
    checkStatusEnhanced();
    loadModelOptions();
    loadStats();
    loadConversations();
    if (typeof loadQuickTestModels === 'function') loadQuickTestModels();
    startAutoRefresh();
    setInterval(loadStats, 60000);
    if (typeof refreshIcons === 'function') refreshIcons();
}

// ========== System User Management ==========

async function loadSystemUsers() {
    const listDiv = document.getElementById('system-users-list');
    if (!listDiv) return;
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
                ? '<span style="color: #28a745;">啟用</span>'
                : '<span style="color: #dc3545;">停用</span>';

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
