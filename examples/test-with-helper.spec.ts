// Example: Using the helper function directly
import { test, expect } from '@playwright/test'
import { captureScreenshot } from 'playwright-pr-review/playwright'

test.describe('My App Screenshots', () => {
  test('homepage', async ({ page }) => {
    await page.goto('https://example.com')

    // Take a screenshot using the helper
    await captureScreenshot(page, 'homepage')

    // Interact with the page
    await page.click('button#login')

    // Take another screenshot
    await captureScreenshot(page, 'login-dialog')
  })

  test('dashboard with custom options', async ({ page }) => {
    await page.goto('https://example.com/dashboard')

    // Take screenshot with custom options
    await captureScreenshot(page, {
      name: 'dashboard',
      fullPage: true,
      screenshotOptions: {
        animations: 'disabled',
      }
    })
  })
})

// Example: Using the helper with testInfo for better context
import { captureScreenshotWithInfo } from 'playwright-pr-review/playwright'

test('with test info context', async ({ page }, testInfo) => {
  await page.goto('https://example.com')

  // Screenshot filename will be prefixed with test name
  // e.g., "with-test-info-context-homepage.png"
  await captureScreenshotWithInfo(page, testInfo, 'homepage')

  // Screenshot is also attached to the test report
  await captureScreenshotWithInfo(page, testInfo, 'after-interaction')
})
