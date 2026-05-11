import { test as setup, expect } from '@playwright/test'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('輸入帳號').fill('aken')
  await page.getByPlaceholder('輸入密碼').fill('1023')
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('/')
  await expect(page.getByText('總覽')).toBeVisible()
  await page.context().storageState({ path: 'e2e/.auth.json' })
})
