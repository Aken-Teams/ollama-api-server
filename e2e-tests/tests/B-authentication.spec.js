// @ts-check
const { test, expect } = require('@playwright/test');
const { login, loginAsUser, ADMIN_USER, ADMIN_PASS, FALLBACK_API_KEY, BASE_URL } = require('./helpers');

test.describe('B. Authentication - Login and permission control', () => {

  test('B1: Login overlay shown on first visit', async ({ page }) => {
    await page.goto('/');
    const overlay = page.locator('#login-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#username-input')).toBeVisible();
    await expect(page.locator('#password-input')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
  });

  test('B2: Wrong credentials show error message', async ({ page }) => {
    await page.goto('/');
    await page.locator('#username-input').fill('wrong-user');
    await page.locator('#password-input').fill('wrong-pass');
    await page.locator('#login-btn').click();
    const error = page.locator('#login-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('帳號或密碼錯誤');
  });

  test('B3: Empty username/password shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('#username-input').waitFor({ state: 'visible' });
    await page.locator('#username-input').fill('');
    await page.locator('#password-input').fill('');
    await page.locator('#login-form').evaluate(form => {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    await page.waitForTimeout(500);
    const error = page.locator('#login-error');
    await expect(error).toBeVisible();
  });

  test('B4: Admin credentials log in as admin', async ({ page }) => {
    await login(page);
    const hasHidden = await page.evaluate(() =>
      document.getElementById('login-overlay').classList.contains('hidden')
    );
    expect(hasHidden).toBe(true);
    // Admin badge should be visible
    const badge = page.locator('#admin-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('管理員');
  });

  test('B5: Non-admin credentials log in as regular user', async ({ page }) => {
    await loginAsUser(page);
    // Badge should now show "使用者" (non-admin) — UI redesigned to always show role
    const badge = page.locator('#admin-badge');
    await expect(badge).toContainText('使用者');
    // Admin nav should be hidden for regular user (sidebar uses #admin-nav)
    const adminNav = page.locator('#admin-nav');
    await expect(adminNav).toBeHidden();
  });

  test('B6: Login persists via localStorage', async ({ page }) => {
    await login(page);
    await page.reload();
    await page.waitForTimeout(3000);
    const hasHidden = await page.evaluate(() =>
      document.getElementById('login-overlay').classList.contains('hidden')
    );
    expect(hasHidden).toBe(true);
  });

  test.skip('B7: Logout returns to login screen', async ({ page }) => {
    await login(page);
    await page.locator('button.logout-btn').click();
    await page.waitForTimeout(1000);
    const hasHidden = await page.evaluate(() =>
      document.getElementById('login-overlay').classList.contains('hidden')
    );
    expect(hasHidden).toBe(false);
  });

  test('B8: API requires authentication - unauthenticated request rejected', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/v1/models`);
    expect(response.status()).toBe(401);
  });

  test('B9: API accepts valid authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': `Bearer ${FALLBACK_API_KEY}` },
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('data');
  });

  test('B10: API rejects invalid API key', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': 'Bearer invalid-key-12345' },
    });
    expect(response.status()).toBe(401);
  });
});
