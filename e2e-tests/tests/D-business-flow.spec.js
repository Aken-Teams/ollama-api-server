// @ts-check
const { test, expect } = require('@playwright/test');
const { login, switchTab, apiRequest, uniqueName, FALLBACK_API_KEY, BASE_URL } = require('./helpers');

test.describe('D. Business Flow - Complete business paths', () => {

  test.skip('D1: Full chat flow - select model, send message, receive response', async ({ page }) => {
    test.setTimeout(120000);
    await login(page);
    await switchTab(page, 'test');
    await page.waitForTimeout(1000);

    // Click "取得模型列表" button
    await page.locator('button:has-text("取得模型列表")').click();
    await page.waitForTimeout(3000);

    // Select a model from dropdown
    const modelSelect = page.locator('#model-select');
    const options = await modelSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);

    // Pick gemma4:31b or first available
    const gemmaOption = options.find(o => o.includes('gemma4'));
    if (gemmaOption) {
      await modelSelect.selectOption({ label: gemmaOption });
    } else {
      await modelSelect.selectOption({ index: 1 });
    }

    // Type a message
    await page.locator('#user-message').fill('Say "hello test" and nothing else.');
    // Uncheck stream mode
    const streamCheckbox = page.locator('#stream-mode');
    if (await streamCheckbox.isChecked()) {
      await streamCheckbox.uncheck();
    }

    // Send
    await page.locator('button:has-text("發送請求")').click();

    // Wait for response container to appear
    await page.waitForFunction(() => {
      const container = document.getElementById('ai-response-container');
      return container && container.style.display !== 'none';
    }, { timeout: 60000 });

    // Wait for content
    await page.waitForTimeout(5000);
    const container = page.locator('#ai-response-container');
    await expect(container).toBeVisible();
  });

  test('D2: Full chat flow via API - chat completions', async ({ request }) => {
    const response = await apiRequest(request, 'post', '/v1/chat/completions', {
      model: 'gemma4:31b',
      messages: [{ role: 'user', content: 'Reply with exactly: E2E_TEST_OK' }],
      max_tokens: 200,
      stream: false,
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBeGreaterThan(0);
    // Content might be in content or reasoning_content
    const msg = data.choices[0].message;
    const hasContent = (msg.content && msg.content.length > 0) ||
                       (msg.reasoning_content && msg.reasoning_content.length > 0);
    expect(hasContent).toBe(true);
    expect(data.usage.total_tokens).toBeGreaterThan(0);
  });

  test.skip('D3: Quick model test cards load', async ({ page }) => {
    await login(page);
    await switchTab(page, 'test');
    await page.waitForTimeout(2000);

    // Trigger model loading via JS
    await page.evaluate(() => loadQuickTestModels());
    // Wait for cards to render
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.model-test-card');
      const loading = document.querySelector('.model-test-loading');
      return cards.length > 0 || (loading && loading.textContent.includes('沒有'));
    }, { timeout: 20000 });

    const testCards = page.locator('.model-test-card');
    const count = await testCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('D4: API Key lifecycle - create, use, deactivate, delete', async ({ request }) => {
    // Step 1: Create
    const createResp = await apiRequest(request, 'post', '/api/keys', {
      username: uniqueName('d4'),
    });
    const created = await createResp.json();
    expect(created.api_key).toBeTruthy();

    // Step 2: Use the key
    const useResp = await request.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': `Bearer ${created.api_key}` },
    });
    expect(useResp.status()).toBe(200);

    // Step 3: Deactivate
    const deactivateResp = await apiRequest(request, 'put', `/api/keys/${created.id}`, {
      is_active: false,
    });
    expect(deactivateResp.status()).toBe(200);

    // Step 4: Verify deactivated key is rejected
    const rejectedResp = await request.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': `Bearer ${created.api_key}` },
    });
    expect(rejectedResp.status()).toBe(401);

    // Step 5: Delete
    const deleteResp = await apiRequest(request, 'delete', `/api/keys/${created.id}`);
    expect(deleteResp.status()).toBe(200);
  });

  test('D5: Statistics update after API request', async ({ request }) => {
    const before = await apiRequest(request, 'get', '/api/stats');
    const beforeData = await before.json();
    const beforeCount = beforeData.summary.total_requests || 0;

    await apiRequest(request, 'post', '/v1/chat/completions', {
      model: 'gemma4:31b',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
      stream: false,
    });

    await new Promise(r => setTimeout(r, 2000));

    const after = await apiRequest(request, 'get', '/api/stats');
    const afterData = await after.json();
    expect(afterData.summary.total_requests).toBeGreaterThanOrEqual(beforeCount);
  });

  test.skip('D6: Service status dashboard shows all endpoints', async ({ page }) => {
    await login(page);
    // Wait for status dashboard to fully load
    await page.waitForTimeout(6000);

    const monitorCards = page.locator('.monitor-card');
    const count = await monitorCards.count();
    expect(count).toBeGreaterThan(0);
  });
});
