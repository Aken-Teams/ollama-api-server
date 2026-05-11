import { test, expect } from '@playwright/test'

test('登入頁面顯示正確元素', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('PJ_API 管理系統')).toBeVisible()
  await expect(page.getByPlaceholder('輸入帳號')).toBeVisible()
  await expect(page.getByPlaceholder('輸入密碼')).toBeVisible()
  await expect(page.getByRole('button', { name: '登入' })).toBeVisible()
})

test('錯誤帳密顯示錯誤訊息', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('輸入帳號').fill('nonexistent_user_xyz')
  await page.getByPlaceholder('輸入密碼').fill('wrongpass')
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/login')),
    page.getByRole('button', { name: '登入' }).click(),
  ])
  expect(response.status()).toBe(401)
  await expect(page.getByText('帳號或密碼錯誤')).toBeVisible()
})
