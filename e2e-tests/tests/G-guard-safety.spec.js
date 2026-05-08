// @ts-check
const { test, expect } = require('@playwright/test');
const { login, switchTab, apiRequest, uniqueName, FALLBACK_API_KEY, BASE_URL } = require('./helpers');

test.describe('G. Guard & Safety - Data protection and access control', () => {

  test('G1: Non-admin API key cannot access admin endpoints', async ({ request }) => {
    // Create a non-admin key
    const createResp = await apiRequest(request, 'post', '/api/keys', {
      username: uniqueName('g-na'),
      is_admin: false,
    });
    const created = await createResp.json();

    // Try to access admin-only endpoint with non-admin key
    const keysResp = await request.get(`${BASE_URL}/api/keys`, {
      headers: { 'Authorization': `Bearer ${created.api_key}` },
    });
    expect(keysResp.status()).toBe(403);

    // Cleanup
    await apiRequest(request, 'delete', `/api/keys/${created.id}`);
  });

  test('G2: Non-admin cannot create API keys', async ({ request }) => {
    // Create a non-admin key
    const createResp = await apiRequest(request, 'post', '/api/keys', {
      username: uniqueName('g-nac'),
      is_admin: false,
    });
    const created = await createResp.json();

    // Try to create another key with non-admin key
    const attemptResp = await request.post(`${BASE_URL}/api/keys`, {
      headers: {
        'Authorization': `Bearer ${created.api_key}`,
        'Content-Type': 'application/json',
      },
      data: { username: 'should-fail' },
    });
    expect(attemptResp.status()).toBe(403);

    // Cleanup
    await apiRequest(request, 'delete', `/api/keys/${created.id}`);
  });

  test('G3: Non-admin cannot delete API keys', async ({ request }) => {
    // Create a non-admin key
    const createResp = await apiRequest(request, 'post', '/api/keys', {
      username: uniqueName('g-nad'),
      is_admin: false,
    });
    const created = await createResp.json();

    // Try to delete with non-admin key
    const deleteResp = await request.delete(`${BASE_URL}/api/keys/${created.id}`, {
      headers: { 'Authorization': `Bearer ${created.api_key}` },
    });
    expect(deleteResp.status()).toBe(403);

    // Cleanup with admin key
    await apiRequest(request, 'delete', `/api/keys/${created.id}`);
  });

  test('G4: Deactivated API key cannot make requests', async ({ request }) => {
    // Create and deactivate a key
    const createResp = await apiRequest(request, 'post', '/api/keys', {
      username: uniqueName('g-deact'),
    });
    const created = await createResp.json();

    await apiRequest(request, 'put', `/api/keys/${created.id}`, {
      is_active: false,
    });

    // Try to use deactivated key
    const useResp = await request.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': `Bearer ${created.api_key}` },
    });
    expect(useResp.status()).toBe(401);

    // Cleanup
    await apiRequest(request, 'delete', `/api/keys/${created.id}`);
  });

  test('G5: Cannot delete the last admin account', async ({ request }) => {
    const listResp = await apiRequest(request, 'get', '/api/keys');
    const data = await listResp.json();
    const adminKeys = data.keys.filter(k => k.is_admin);

    if (adminKeys.length === 1) {
      const deleteResp = await apiRequest(request, 'delete', `/api/keys/${adminKeys[0].id}`);
      expect(deleteResp.status()).toBe(400);
    } else {
      // If multiple admins, just verify the endpoint works
      expect(adminKeys.length).toBeGreaterThan(0);
    }
  });

  test('G6: API key prefix is visible but full key is not stored in detail', async ({ request }) => {
    const createResp = await apiRequest(request, 'post', '/api/keys', {
      username: uniqueName('g-prefix'),
    });
    const created = await createResp.json();
    const fullKey = created.api_key;

    // Get key details - should show prefix only
    const detailResp = await apiRequest(request, 'get', `/api/keys/${created.id}`);
    const detail = await detailResp.json();
    // Prefix should exist
    expect(detail).toHaveProperty('api_key_prefix');
    expect(detail.api_key_prefix.length).toBeGreaterThan(0);
    // Detail response should NOT expose full api_key
    const detailStr = JSON.stringify(detail);
    expect(detailStr).not.toContain(fullKey);

    await apiRequest(request, 'delete', `/api/keys/${created.id}`);
  });

  test('G7: Request without Authorization header is rejected', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/v1/models`);
    expect(response.status()).toBe(401);
  });

  test('G8: Malformed Authorization header is rejected', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': 'InvalidFormat' },
    });
    expect(response.status()).toBe(401);
  });

  test('G9: Non-admin cannot update DeepSeek API key', async ({ request }) => {
    const createResp = await apiRequest(request, 'post', '/api/keys', {
      username: uniqueName('g-nads'),
      is_admin: false,
    });
    const created = await createResp.json();

    const updateResp = await request.put(`${BASE_URL}/api/deepseek/config`, {
      headers: {
        'Authorization': `Bearer ${created.api_key}`,
        'Content-Type': 'application/json',
      },
      data: { api_key: 'sk-stolen-key' },
    });
    expect(updateResp.status()).toBe(403);

    await apiRequest(request, 'delete', `/api/keys/${created.id}`);
  });

  test.skip('G10: Logout clears localStorage auth', async ({ page }) => {
    await login(page);
    await page.locator('button.logout-btn').click();
    await page.waitForTimeout(500);

    const authValue = await page.evaluate(() => localStorage.getItem('pj_authenticated'));
    expect(authValue).toBeNull();
  });
});
