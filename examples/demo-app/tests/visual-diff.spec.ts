import { test, expect } from '@playwright/test'
import { captureScreenshot } from '@kernel-labs/glimpse/playwright'

const variant = process.env.DEMO_VARIANT || 'current'
const outputDir = process.env.DEMO_SCREENSHOTS_DIR || 'test-results/pr-screenshots'
const screenshotName = process.env.DEMO_SCREENSHOT_NAME || 'revenue-overview'

test('captures the revenue dashboard with Glimpse', async ({ page }) => {
  if (variant !== 'baseline' && variant !== 'current') {
    throw new Error('DEMO_VARIANT must be baseline or current')
  }

  await page.goto(`/?variant=${variant}&capture=1`)
  await expect(page.getByRole('heading', { name: 'Revenue overview' })).toBeVisible()

  await captureScreenshot(page, {
    name: screenshotName,
    outputDir,
    screenshotOptions: { animations: 'disabled' },
  })
})
