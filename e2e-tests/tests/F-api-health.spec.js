// @ts-check
const { test, expect } = require('@playwright/test');
const { apiRequest, FALLBACK_API_KEY, BASE_URL } = require('./helpers');

test.describe('F. API Health Check - All endpoints verification', () => {

  test('F1: GET /health returns healthy status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`, {
      headers: { 'Authorization': `Bearer ${FALLBACK_API_KEY}` },
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data).toHaveProperty('endpoints');
  });

  test('F2: Health endpoint reports all configured endpoints', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`, {
      headers: { 'Authorization': `Bearer ${FALLBACK_API_KEY}` },
    });
    const data = await response.json();
    const endpoints = Object.keys(data.endpoints);
    expect(endpoints.length).toBeGreaterThanOrEqual(3);
    expect(endpoints.some(e => e.includes('21180'))).toBe(true);
  });

  test('F3: Gemma4 endpoint (21181) is registered', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`, {
      headers: { 'Authorization': `Bearer ${FALLBACK_API_KEY}` },
    });
    const data = await response.json();
    const gemmaEndpoint = Object.entries(data.endpoints).find(([k]) => k.includes('21181'));
    expect(gemmaEndpoint).toBeTruthy();
    // Verify it's registered (may be healthy or unhealthy depending on timing)
    expect(['healthy', 'unhealthy']).toContain(gemmaEndpoint[1]);
  });

  test('F4: GET /v1/models returns model list', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/v1/models');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('data');
    expect(data.data.length).toBeGreaterThan(0);
  });

  test('F5: GET /api/stats returns statistics', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/api/stats');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('total_requests');
    expect(data.summary).toHaveProperty('success_rate');
  });

  test('F6: GET /api/keys returns key list (admin)', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/api/keys');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('keys');
    expect(Array.isArray(data.keys)).toBe(true);
  });

  test('F7: GET /api/me returns user info', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/api/me');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('username');
    expect(data).toHaveProperty('is_admin');
  });

  test('F8: GET /api/conversations returns conversation list', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/api/conversations');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('conversations');
  });

  test('F9: GET /v1/ocr/models returns OCR models', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/v1/ocr/models');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('models');
  });

  test('F10: GET /v1/ocr/health returns OCR health', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/v1/ocr/health');
    expect(response.status()).toBe(200);
  });

  test('F11: POST /v1/chat/completions works', async ({ request }) => {
    const response = await apiRequest(request, 'post', '/v1/chat/completions', {
      model: 'gemma4:31b',
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 50,
      stream: false,
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('choices');
  });

  test('F12: GET /api/deepseek/config returns config (admin)', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/api/deepseek/config');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('api_key_status');
  });

  test('F13: GET /api/deepseek/balance returns balance info', async ({ request }) => {
    const response = await apiRequest(request, 'get', '/api/deepseek/balance');
    expect([200, 503]).toContain(response.status());
  });

  test('F14: Root endpoint serves HTML page', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('PJ_API');
  });
});
