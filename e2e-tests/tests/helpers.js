/**
 * Shared helpers for E2E tests
 *
 * NOTE (2026-05-08): server migrated from "answer the question" login
 * to MySQL system_users table (POST /api/login with {username, password}).
 * Old ADMIN_ANSWER/USER_ANSWER constants are removed.
 */

// Default admin/user credentials in MySQL system_users
// (init_system_users_table inserts 'aken'/'1023' if table is empty)
const ADMIN_USER = 'aken';
const ADMIN_PASS = '1023';
// Test-only non-admin user. Created via /api/system-users by setup if missing.
const USER_USER  = 'e2e_user';
const USER_PASS  = 'e2e_pass';

// Master / fallback API key — gateway accepts this directly as admin (no DB lookup)
const FALLBACK_API_KEY = 'pj-admin-zhpjaiaoi-2024';
const MASTER_API_KEY   = FALLBACK_API_KEY; // alias for older test code
const BASE_URL = 'http://localhost:8777';

/** Generate unique username for tests */
function uniqueName(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generic login: fills username + password, submits form, waits for overlay to hide
 */
async function loginAs(page, username, password) {
  await page.goto('/');
  const usernameInput = page.locator('#username-input');
  const passwordInput = page.locator('#password-input');
  await usernameInput.waitFor({ state: 'visible', timeout: 10000 });
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await page.locator('#login-btn').click();
  await page.waitForFunction(() => {
    const overlay = document.getElementById('login-overlay');
    return overlay && overlay.classList.contains('hidden');
  }, { timeout: 15000 });
  await page.waitForTimeout(1000);
}

/** Login as default admin */
async function login(page) {
  await loginAs(page, ADMIN_USER, ADMIN_PASS);
}

/** Login as default non-admin user */
async function loginAsUser(page) {
  await loginAs(page, USER_USER, USER_PASS);
}

// UI redesigned: old 5 separate tabs → new sidebar (dashboard/tools/admin/docs).
// Old test code uses old names; we alias them to the new sidebar tab + click
// the appropriate sub-tab inside.
const TAB_ALIAS = {
  status:  { tab: 'dashboard' },
  stats:   { tab: 'dashboard' },
  test:    { tab: 'tools', sub: 'tool-test' },
  speech:  { tab: 'tools', sub: 'tool-speech' },
  ocr:     { tab: 'tools', sub: 'tool-ocr' },
  docs:    { tab: 'docs' },
  keys:    { tab: 'admin' },
  tools:   { tab: 'tools' },
  admin:   { tab: 'admin' },
  dashboard:{ tab: 'dashboard' },
  sysconfig:{ tab: 'sysconfig' },
};

/**
 * Switch to a specific tab. Handles both legacy tab names and new sidebar nav.
 */
async function switchTab(page, tabName) {
  const alias = TAB_ALIAS[tabName] || { tab: tabName };
  const sidebarNav = page.locator(`.sidebar-nav a[data-tab="${alias.tab}"]`);
  const legacyBtn  = page.locator(`button.tab[onclick="switchTab('${tabName}')"]`);
  if (await sidebarNav.count())      await sidebarNav.first().click();
  else if (await legacyBtn.count())  await legacyBtn.click();
  else throw new Error(`switchTab: no element found for tab "${tabName}"`);
  await page.waitForTimeout(400);
  // Click sub-tab if applicable
  if (alias.sub) {
    const subBtn = page.locator(`button.sub-tab[onclick*="${alias.sub}"]`);
    if (await subBtn.count()) await subBtn.first().click();
    await page.waitForTimeout(300);
  }
}

/**
 * Make authenticated API request (admin via FALLBACK_API_KEY)
 *
 * Auto-injects a default `description` for POST /api/keys (server now requires
 * it; older tests don't pass one).
 */
async function apiRequest(request, method, path, body = null) {
  // Backfill required field for /api/keys POST so older specs keep working
  if (method === 'post' && path === '/api/keys' && body && !body.description) {
    body = { ...body, description: 'e2e auto-test' };
  }
  const options = {
    headers: {
      'Authorization': `Bearer ${FALLBACK_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.data = body;
  return await request[method](`${BASE_URL}${path}`, options);
}

module.exports = {
  ADMIN_USER, ADMIN_PASS,
  USER_USER, USER_PASS,
  // Backward-compat names (now hold credentials, not answers)
  ADMIN_ANSWER: ADMIN_PASS,
  USER_ANSWER: USER_PASS,
  MASTER_API_KEY,
  FALLBACK_API_KEY,
  BASE_URL,
  uniqueName,
  login,
  loginAs,
  loginAsUser,
  switchTab,
  apiRequest,
};
