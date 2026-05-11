import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8777',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
})
