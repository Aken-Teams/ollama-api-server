// ==========================================================================
// TABS MODULE - Sidebar Navigation
// ==========================================================================

function switchTab(tabName, clickedEl) {
    // Update sidebar nav active state
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.classList.remove('active');
    });
    if (clickedEl) {
        clickedEl.classList.add('active');
    } else {
        // Find the sidebar link by data-tab
        const link = document.querySelector('.sidebar-nav a[data-tab="' + tabName + '"]');
        if (link) link.classList.add('active');
    }

    // Update content visibility
    document.querySelectorAll('.content-area .content').forEach(content => {
        content.classList.remove('active');
    });
    const target = document.getElementById(tabName);
    if (target) target.classList.add('active');

    // Load data for specific tabs
    if (tabName === 'dashboard') {
        checkStatusEnhanced();
        loadStats();
    } else if (tabName === 'admin') {
        loadApiKeys();
        loadSystemUsers();
    } else if (tabName === 'sysconfig') {
        loadDeepSeekConfig();
    }
}

// Sub-tab switching for AI Tools
function switchSubTab(btn, subTabId) {
    // Update sub-tab buttons
    btn.parentElement.querySelectorAll('.sub-tab').forEach(t => {
        t.classList.remove('active');
        t.style.color = '';
        t.style.fontWeight = '';
        t.style.borderBottom = '';
    });
    btn.classList.add('active');

    // Update sub-content visibility
    document.querySelectorAll('#tools .sub-content').forEach(c => {
        c.style.display = 'none';
    });
    document.getElementById(subTabId).style.display = 'block';
}

// Admin sub-tab switching (API Key vs Users)
function switchAdminSubTab(btn, subTabId) {
    // Update admin sub-tab buttons
    btn.parentElement.querySelectorAll('.admin-sub-tab').forEach(t => {
        t.classList.remove('active');
    });
    btn.classList.add('active');

    // Toggle visibility of keys / users / permissions
    var keysDiv = document.getElementById('keys');
    var usersDiv = document.getElementById('users');
    var permDiv = document.getElementById('permissions');
    if (keysDiv) keysDiv.style.display = subTabId === 'keys' ? 'block' : 'none';
    if (usersDiv) usersDiv.style.display = subTabId === 'users' ? 'block' : 'none';
    if (permDiv) permDiv.style.display = subTabId === 'permissions' ? 'block' : 'none';

    if (subTabId === 'users') {
        loadSystemUsers();
    } else if (subTabId === 'permissions') {
        loadPermissions();
    }
}

// Auto-refresh toggle
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
