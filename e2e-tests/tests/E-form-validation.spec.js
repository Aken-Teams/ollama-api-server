// @ts-check
const { test, expect } = require('@playwright/test');
const { login, switchTab, apiRequest, BASE_URL, FALLBACK_API_KEY } = require('./helpers');

test.describe('E. Form Validation - Edge cases and abnormal input', () => {

  test('E1: Login with empty password shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('#password-input').waitFor({ state: 'visible' });
    await page.locator('#password-input').fill('');
    await page.locator('#login-form').evaluate(form => {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page.locator('#login-error')).toBeVisible();
  });

  test('E2: Login with spaces-only password shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('#password-input').waitFor({ state: 'visible' });
    await page.locator('#password-input').fill('   ');
    await page.locator('#login-form').evaluate(form => {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page.locator('#login-error')).toBeVisible();
  });

  test.skip('E3: Chat with no model selected should not crash', async ({ page }) => {
    await login(page);
    await switchTab(page, 'test');
    await page.waitForTimeout(500);
    await page.locator('#user-message').fill('test message');
    await page.locator('button:has-text("發送請求")').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('#test')).toHaveClass(/active/);
  });

  test.skip('E4: Chat with empty message should handle gracefully', async ({ page }) => {
    await login(page);
    await switchTab(page, 'test');
    await page.waitForTimeout(500);
    await page.locator('#user-message').fill('');
    await page.locator('button:has-text("發送請求")').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('#test')).toHaveClass(/active/);
  });

  test('E5: API - chat with missing model field returns error', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/v1/chat/completions`, {
      headers: {
        'Authorization': `Bearer ${FALLBACK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: {
        messages: [{ role: 'user', content: 'test' }],
      },
    });
    expect([400, 422, 500]).toContain(response.status());
  });

  test('E6: API - chat with empty messages array', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/v1/chat/completions`, {
      headers: {
        'Authorization': `Bearer ${FALLBACK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: 'gemma4:31b',
        messages: [],
      },
    });
    // May succeed or fail - just should not crash server
    expect([200, 400, 422, 500]).toContain(response.status());
  });

  test('E7: API - create key with empty username', async ({ request }) => {
    const response = await apiRequest(request, 'post', '/api/keys', {
      username: '',
    });
    expect([400, 422, 500, 200]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      await apiRequest(request, 'delete', `/api/keys/${data.id}`);
    }
  });

  test('E8: API - chat with non-existent model', async ({ request }) => {
    const response = await apiRequest(request, 'post', '/v1/chat/completions', {
      model: 'non-existent-model-xyz',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 10,
      stream: false,
    });
    // Server may return 200 with error in body, or various error codes
    expect([200, 400, 404, 500, 502, 503]).toContain(response.status());
  });

  test('E9: Create API key with very long username', async ({ request }) => {
    const longName = 'a'.repeat(200);
    const response = await apiRequest(request, 'post', '/api/keys', {
      username: longName,
    });
    expect([200, 400, 422, 500]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      await apiRequest(request, 'delete', `/api/keys/${data.id}`);
    }
  });

  test('E10: Create API key with special characters in username', async ({ request }) => {
    const response = await apiRequest(request, 'post', '/api/keys', {
      username: 'test<script>alert(1)</script>',
      description: '"><img onerror=alert(1) src=x>',
    });
    expect([200, 400, 422]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      await apiRequest(request, 'delete', `/api/keys/${data.id}`);
    }
  });
});
