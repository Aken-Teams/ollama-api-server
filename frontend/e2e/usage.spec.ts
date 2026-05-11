import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth.json' })

test('使用記錄頁面顯示', async ({ page }) => {
  await page.goto('/admin/usage')
  await expect(page.getByText('使用記錄')).toBeVisible()
  await expect(page.getByText('查看所有 API 呼叫記錄')).toBeVisible()
})

test('使用記錄有資料或顯示空白提示', async ({ page }) => {
  await page.goto('/admin/usage')
  await page.waitForTimeout(2000)
  const hasData = await page.getByText('共').isVisible().catch(() => false)
  const isEmpty = await page.getByText('暫無使用記錄').isVisible().catch(() => false)
  expect(hasData || isEmpty).toBe(true)
})

test('使用者篩選輸入框', async ({ page }) => {
  await page.goto('/admin/usage')
  const filter = page.getByPlaceholder('篩選使用者...')
  await expect(filter).toBeVisible()
  await filter.fill('aken')
  await page.waitForTimeout(500)
  // Should still show the page without errors
  await expect(page.getByText('使用記錄')).toBeVisible()
})
