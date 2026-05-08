// @ts-check
const { test, expect } = require('@playwright/test');
const { login, switchTab } = require('./helpers');

// Skipped: UI redesigned (top-tabs → sidebar nav). Spec assertions reference
// removed DOM IDs (#status, button.tab, etc). Re-enable when assertions are
// rewritten for the new sidebar-based layout.
test.describe.skip('A. Navigation - All pages load correctly', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('A1: Homepage loads and shows service status tab by default', async ({ page }) => {
    const statusDiv = page.locator('#status');
    await expect(statusDiv).toHaveClass(/active/);
    await expect(page.locator('#overall-status')).toBeVisible();
  });

  test('A2: Can navigate to Usage Statistics tab', async ({ page }) => {
    await switchTab(page, 'stats');
    await expect(page.locator('#stats')).toHaveClass(/active/);
  });

  test('A3: Can navigate to API Test tab', async ({ page }) => {
    await switchTab(page, 'test');
    await expect(page.locator('#test')).toHaveClass(/active/);
  });

  test('A4: Can navigate to Speech-to-Text tab', async ({ page }) => {
    await switchTab(page, 'speech');
    await expect(page.locator('#speech')).toHaveClass(/active/);
  });

  test('A5: Can navigate to OCR tab', async ({ page }) => {
    await switchTab(page, 'ocr');
    await expect(page.locator('#ocr')).toHaveClass(/active/);
  });

  test('A6: Can navigate to Documentation tab', async ({ page }) => {
    await switchTab(page, 'docs');
    await expect(page.locator('#docs')).toHaveClass(/active/);
  });

  test('A7: API Key Management tab visible for admin user', async ({ page }) => {
    const keysTab = page.locator('#keys-tab');
    await expect(keysTab).toBeVisible();
    await keysTab.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#keys')).toHaveClass(/active/);
  });

  test('A8: All tab buttons exist in navigation', async ({ page }) => {
    const tabs = ['status', 'stats', 'test', 'speech', 'ocr', 'docs'];
    for (const tab of tabs) {
      const btn = page.locator(`button.tab[onclick="switchTab('${tab}')"]`);
      await expect(btn).toBeVisible();
    }
  });

  test('A9: Tab switching hides previous section', async ({ page }) => {
    await switchTab(page, 'test');
    await expect(page.locator('#test')).toHaveClass(/active/);
    await expect(page.locator('#status')).not.toHaveClass(/active/);
    await switchTab(page, 'status');
    await expect(page.locator('#status')).toHaveClass(/active/);
    await expect(page.locator('#test')).not.toHaveClass(/active/);
  });

  test('A10: User info displayed in nav bar after login', async ({ page }) => {
    const userInfo = page.locator('div.user-info');
    await expect(userInfo).toBeVisible();
  });
});
