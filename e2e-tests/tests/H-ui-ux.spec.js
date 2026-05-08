// @ts-check
const { test, expect } = require('@playwright/test');
const { login, switchTab } = require('./helpers');

// Skipped: UI redesigned. Most assertions target removed DOM IDs / classes.
// Re-enable when rewritten for sidebar/redesign.css layout.
test.describe.skip('H. UI/UX - Interface display and interaction', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('H1: Login page has proper layout and styling', async ({ page }) => {
    await page.locator('button.logout-btn').click();
    await page.waitForTimeout(1000);

    const hasHidden = await page.evaluate(() =>
      document.getElementById('login-overlay').classList.contains('hidden')
    );
    expect(hasHidden).toBe(false);
    await expect(page.locator('#password-input')).toBeVisible();
  });

  test('H2: Dashboard cards display properly with status indicators', async ({ page }) => {
    await page.waitForTimeout(5000);
    const overallStatus = page.locator('#overall-status');
    await expect(overallStatus).toBeVisible();

    // Online count should have loaded (may still be "-" if health check slow)
    const onlineText = await page.locator('#online-count').textContent();
    // Just verify element exists and has content
    expect(onlineText.length).toBeGreaterThan(0);
  });

  test('H3: Tab active state changes correctly', async ({ page }) => {
    await switchTab(page, 'stats');
    const statsBtn = page.locator("button.tab[onclick=\"switchTab('stats')\"]");
    await expect(statsBtn).toHaveClass(/active/);

    await switchTab(page, 'test');
    const testBtn = page.locator("button.tab[onclick=\"switchTab('test')\"]");
    await expect(testBtn).toHaveClass(/active/);
    await expect(statsBtn).not.toHaveClass(/active/);
  });

  test('H4: Model select dropdown populates after loading', async ({ page }) => {
    await switchTab(page, 'test');
    await page.locator('button:has-text("取得模型列表")').click();
    await page.waitForTimeout(3000);

    const modelSelect = page.locator('#model-select');
    const options = await modelSelect.locator('option').count();
    expect(options).toBeGreaterThan(1);
  });

  test('H5: AI response container shows after sending message', async ({ page }) => {
    test.setTimeout(120000);
    await switchTab(page, 'test');
    await page.locator('button:has-text("取得模型列表")').click();
    await page.waitForTimeout(3000);

    await page.locator('#model-select').selectOption({ index: 1 });
    await page.locator('#user-message').fill('Reply: hello');

    const streamCheckbox = page.locator('#stream-mode');
    if (await streamCheckbox.isChecked()) {
      await streamCheckbox.uncheck();
    }
    await page.locator('button:has-text("發送請求")').click();

    await page.waitForFunction(() => {
      const container = document.getElementById('ai-response-container');
      return container && container.style.display !== 'none';
    }, { timeout: 90000 });

    await expect(page.locator('#ai-response-container')).toBeVisible();
  });

  test('H6: Stats page shows charts and metrics', async ({ page }) => {
    await switchTab(page, 'stats');
    await page.waitForTimeout(2000);
    await expect(page.locator('#stats')).toHaveClass(/active/);
  });

  test('H7: OCR tab shows method selection buttons', async ({ page }) => {
    await switchTab(page, 'ocr');

    // Check for OCR method buttons by their specific class
    await expect(page.locator('.ocr-method-name:has-text("PP-OCR")')).toBeVisible();
    await expect(page.locator('.ocr-method-name:has-text("DeepSeek")')).toBeVisible();
    await expect(page.locator('.ocr-method-name:has-text("視覺模型")')).toBeVisible();
  });

  test('H8: Speech tab shows microphone button', async ({ page }) => {
    await switchTab(page, 'speech');
    const micBtn = page.locator('#mic-btn');
    await expect(micBtn).toBeVisible();
  });

  test('H9: Responsive layout - no horizontal overflow', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
  });

  test('H10: Admin badge visible for admin user', async ({ page }) => {
    const userInfo = page.locator('div.user-info');
    await expect(userInfo).toBeVisible();
    const text = await userInfo.textContent();
    expect(text).toContain('管理員');
  });
});
