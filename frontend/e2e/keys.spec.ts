import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth.json' })

test('Key 管理頁面顯示', async ({ page }) => {
  await page.goto('/admin/keys')
  await expect(page.getByText('API Key 管理')).toBeVisible()
  await expect(page.getByRole('button', { name: /新增 Key/ })).toBeVisible()
})

test('展示使用者 Key 列表', async ({ page }) => {
  await page.goto('/admin/keys')
  // At least one user group should be visible
  await expect(page.locator('.divide-y').first()).toBeVisible({ timeout: 10000 })
})

test('新增 Key 表單開關', async ({ page }) => {
  await page.goto('/admin/keys')
  await page.getByRole('button', { name: /新增 Key/ }).click()
  await expect(page.getByText('建立新 API Key')).toBeVisible()
  // Close
  await page.keyboard.press('Escape')
})

test('建立並顯示新 Key', async ({ page }) => {
  await page.goto('/admin/keys')
  await page.getByRole('button', { name: /新增 Key/ }).click()
  await page.getByPlaceholder('例：開發測試用途').fill('e2e-test-key')
  await page.getByRole('button', { name: '建立 Key' }).click()
  // New key display should appear
  await expect(page.getByText('Key 建立成功')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('請立即複製此 Key')).toBeVisible()
})
