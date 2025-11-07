import type { Page, TestInfo } from '@playwright/test'
import path from 'path'
import fs from 'fs'

export interface ScreenshotOptions {
  /** Screenshot name (will be used as filename) */
  name: string
  /** Custom output directory (default: test-results/pr-screenshots) */
  outputDir?: string
  /** Whether to capture full page (default: true) */
  fullPage?: boolean
  /** Playwright screenshot options */
  screenshotOptions?: Parameters<Page['screenshot']>[0]
}

/**
 * Output directory for PR screenshots
 * Can be overridden with PR_SCREENSHOTS_DIR environment variable
 */
export const DEFAULT_SCREENSHOT_DIR = process.env.PR_SCREENSHOTS_DIR || 'test-results/pr-screenshots'

/**
 * Helper function to capture screenshots during Playwright tests
 * Screenshots are automatically saved to a directory that can be uploaded by playwright-pr-review
 *
 * @example
 * ```typescript
 * import { captureScreenshot } from 'playwright-pr-review/playwright'
 *
 * test('my test', async ({ page }) => {
 *   await page.goto('/')
 *   await captureScreenshot(page, { name: 'homepage' })
 * })
 * ```
 */
export async function captureScreenshot(
  page: Page,
  options: string | ScreenshotOptions
): Promise<string> {
  const opts = typeof options === 'string' ? { name: options } : options
  const { name, outputDir = DEFAULT_SCREENSHOT_DIR, fullPage = true, screenshotOptions = {} } = opts

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Generate screenshot filename
  const filename = name.endsWith('.png') ? name : `${name}.png`
  const screenshotPath = path.join(outputDir, filename)

  console.log(`📸 Capturing screenshot: ${filename}`)

  // Take screenshot
  await page.screenshot({
    path: screenshotPath,
    fullPage,
    ...screenshotOptions
  })

  return screenshotPath
}

/**
 * Helper to capture screenshot with test info context
 * This version integrates better with Playwright's test runner
 *
 * @example
 * ```typescript
 * import { captureScreenshotWithInfo } from 'playwright-pr-review/playwright'
 *
 * test('my test', async ({ page }, testInfo) => {
 *   await page.goto('/')
 *   await captureScreenshotWithInfo(page, testInfo, 'homepage')
 * })
 * ```
 */
export async function captureScreenshotWithInfo(
  page: Page,
  testInfo: TestInfo,
  options: string | ScreenshotOptions
): Promise<string> {
  const opts = typeof options === 'string' ? { name: options } : options
  const { name, outputDir = DEFAULT_SCREENSHOT_DIR, fullPage = true, screenshotOptions = {} } = opts

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Generate filename with test context
  const sanitizedTestName = testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const filename = name.endsWith('.png') ? name : `${name}.png`
  const prefixedFilename = `${sanitizedTestName}-${filename}`
  const screenshotPath = path.join(outputDir, prefixedFilename)

  console.log(`📸 Capturing screenshot: ${prefixedFilename}`)

  // Take screenshot
  await page.screenshot({
    path: screenshotPath,
    fullPage,
    ...screenshotOptions
  })

  // Also attach to test report
  testInfo.attachments.push({
    name: `screenshot-${name}`,
    path: screenshotPath,
    contentType: 'image/png'
  })

  return screenshotPath
}
