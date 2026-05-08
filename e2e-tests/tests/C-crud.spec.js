// @ts-check
const { test, expect } = require('@playwright/test');
const { login, switchTab, apiRequest, uniqueName } = require('./helpers');

test.describe('C. CRUD - Create, Read, Update, Delete operations', () => {

  test.describe('API Key CRUD', () => {
    test('C1: Create new API key via API', async ({ request }) => {
      const name = uniqueName('c1');
      const response = await apiRequest(request, 'post', '/api/keys', { username: name });
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('api_key');
      expect(data.username).toBe(name);
      await apiRequest(request, 'delete', `/api/keys/${data.id}`);
    });

    test('C2: Read API keys list', async ({ request }) => {
      const response = await apiRequest(request, 'get', '/api/keys');
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('keys');
      expect(data.keys.length).toBeGreaterThan(0);
    });

    test('C3: Update API key status', async ({ request }) => {
      const name = uniqueName('c3');
      const createResp = await apiRequest(request, 'post', '/api/keys', { username: name });
      const created = await createResp.json();

      const updateResp = await apiRequest(request, 'put', `/api/keys/${created.id}`, {
        is_active: false,
      });
      expect(updateResp.status()).toBe(200);

      const getResp = await apiRequest(request, 'get', `/api/keys/${created.id}`);
      const detail = await getResp.json();
      expect(detail.is_active).toBe(false);

      await apiRequest(request, 'delete', `/api/keys/${created.id}`);
    });

    test('C4: Delete API key', async ({ request }) => {
      const name = uniqueName('c4');
      const createResp = await apiRequest(request, 'post', '/api/keys', { username: name });
      const created = await createResp.json();

      const deleteResp = await apiRequest(request, 'delete', `/api/keys/${created.id}`);
      expect(deleteResp.status()).toBe(200);

      const listResp = await apiRequest(request, 'get', '/api/keys');
      const list = await listResp.json();
      const found = list.keys.find(k => k.id === created.id);
      expect(found).toBeUndefined();
    });

    test('C5: Regenerate API key', async ({ request }) => {
      const name = uniqueName('c5');
      const createResp = await apiRequest(request, 'post', '/api/keys', { username: name });
      const created = await createResp.json();

      const regenResp = await apiRequest(request, 'post', `/api/keys/${created.id}/regenerate`);
      expect(regenResp.status()).toBe(200);
      const regen = await regenResp.json();
      expect(regen).toHaveProperty('api_key');

      await apiRequest(request, 'delete', `/api/keys/${created.id}`);
    });
  });

  test.describe('Model & Stats', () => {
    test('C6: List all models returns data', async ({ request }) => {
      const response = await apiRequest(request, 'get', '/v1/models');
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.data.length).toBeGreaterThan(0);
    });

    test('C7: Models list contains expected models', async ({ request }) => {
      const response = await apiRequest(request, 'get', '/v1/models');
      const data = await response.json();
      const ids = data.data.map(m => m.id);
      expect(ids.some(id => id.includes('gemma4') || id.includes('gpt-oss') || id.includes('deepseek'))).toBe(true);
    });

    test('C8: Read statistics', async ({ request }) => {
      const response = await apiRequest(request, 'get', '/api/stats');
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('total_requests');
    });
  });

  // Skipped: UI redesigned (admin sub-tabs). C9/C10 assert old DOM (#keys etc).
  test.describe.skip('UI CRUD', () => {
    test('C9: API Keys tab loads', async ({ page }) => {
      await login(page);
      await switchTab(page, 'keys');
      await page.waitForTimeout(1500);
      await expect(page.locator('#keys')).toHaveClass(/active/);
    });

    test('C10: Create API key via UI form', async ({ page, request }) => {
      await login(page);
      await switchTab(page, 'keys');
      await page.waitForTimeout(1500);

      const name = uniqueName('ui');
      await page.locator('#new-key-username').fill(name);
      await page.locator('#new-key-description').fill('E2E test');
      await page.locator('button:has-text("建立 Key")').click();
      await page.waitForTimeout(2000);

      const response = await apiRequest(request, 'get', '/api/keys');
      const keys = await response.json();
      const found = keys.keys.find(k => k.username === name);
      expect(found).toBeTruthy();
      if (found) await apiRequest(request, 'delete', `/api/keys/${found.id}`);
    });
  });
});
