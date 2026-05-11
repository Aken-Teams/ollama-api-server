import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth.json' })

test('Dashboard 顯示統計數字', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('總請求')).toBeVisible()
  await expect(page.getByText('活躍 Key')).toBeVisible()
  await expect(page.getByText('可用模型')).toBeVisible()
  await expect(page.getByText('Token 用量')).toBeVisible()
})

test('Dashboard 顯示圖表', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('每日請求（近 14 天）')).toBeVisible()
  await expect(page.getByText('模型使用分布')).toBeVisible()
})

test('Dashboard 顯示主機狀態', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('主機狀態')).toBeVisible()
  await expect(page.getByText('CPU', { exact: true })).toBeVisible()
  await expect(page.getByText('記憶體', { exact: true })).toBeVisible()
  // 磁碟 appears in label and in the value text — check the label specifically
  await expect(page.locator('text=磁碟').first()).toBeVisible()
})

test('未登入訪問首頁跳轉登入頁', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto('/')
  // React router redirect may take a moment after hydration
  await page.waitForURL(/\/login/, { timeout: 10000 })
  await expect(page).toHaveURL(/\/login/)
  await ctx.close()
})
