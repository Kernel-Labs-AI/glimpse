import { test, expect } from '@playwright/test'
import { captureScreenshot, captureScreenshotWithInfo, DEFAULT_SCREENSHOT_DIR } from '../src/playwright/helpers.js'
import { Page, TestInfo } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import os from 'os'

test.describe('Playwright Helpers', () => {
  let tempDir: string
  let mockPage: Page
  let mockTestInfo: TestInfo

  test.beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-playwright-'))
    
    // Create a minimal mock page
    mockPage = {
      screenshot: async (options: any) => {
        if (options?.path) {
          fs.writeFileSync(options.path, 'fake screenshot')
        }
        return Buffer.from('fake screenshot')
      },
    } as any as Page

    mockTestInfo = {
      title: 'test example',
      attachments: [],
    } as any as TestInfo
  })

  test.afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should have default screenshot directory', () => {
    expect(DEFAULT_SCREENSHOT_DIR).toBeDefined()
    expect(typeof DEFAULT_SCREENSHOT_DIR).toBe('string')
  })

  test('should capture screenshot with string name', async () => {
    // Test string overload
    const screenshotPath1 = await captureScreenshot(mockPage, 'test-screenshot')
    expect(screenshotPath1).toContain('test-screenshot.png')
    // Note: This will use default directory, so we can't check existence easily

    // Test options object
    const screenshotPath2 = await captureScreenshot(mockPage, {
      name: 'test-screenshot',
      outputDir: tempDir,
    })

    expect(screenshotPath2).toContain('test-screenshot.png')
    expect(fs.existsSync(screenshotPath2)).toBe(true)
  })

  test('should capture screenshot with options object', async () => {
    const screenshotPath = await captureScreenshot(mockPage, {
      name: 'custom-name',
      outputDir: tempDir,
      fullPage: false,
    })

    expect(screenshotPath).toContain('custom-name.png')
    expect(fs.existsSync(screenshotPath)).toBe(true)
  })

  test('should create output directory if it does not exist', async () => {
    const customDir = path.join(tempDir, 'nested', 'dir')
    
    await captureScreenshot(mockPage, {
      name: 'test',
      outputDir: customDir,
    })

    expect(fs.existsSync(customDir)).toBe(true)
  })

  test('should add .png extension if not present', async () => {
    const screenshotPath = await captureScreenshot(mockPage, {
      name: 'test-without-extension',
      outputDir: tempDir,
    })

    expect(screenshotPath.endsWith('.png')).toBe(true)
  })

  test('should preserve .png extension if present', async () => {
    const screenshotPath = await captureScreenshot(mockPage, {
      name: 'test.png',
      outputDir: tempDir,
    })

    expect(screenshotPath.endsWith('.png')).toBe(true)
    expect(screenshotPath).toContain('test.png')
  })

  test('should capture screenshot with test info', async () => {
    const screenshotPath = await captureScreenshotWithInfo(
      mockPage,
      mockTestInfo,
      {
        name: 'test-screenshot',
        outputDir: tempDir,
      }
    )

    expect(screenshotPath).toContain('test-example-test-screenshot.png')
    expect(fs.existsSync(screenshotPath)).toBe(true)
    expect(mockTestInfo.attachments.length).toBeGreaterThan(0)
  })

  test('should sanitize test name in filename', async () => {
    mockTestInfo.title = 'Test With Spaces & Special! Characters'
    
    const screenshotPath = await captureScreenshotWithInfo(
      mockPage,
      mockTestInfo,
      {
        name: 'screenshot',
        outputDir: tempDir,
      }
    )

    // Should sanitize special characters
    expect(screenshotPath).toMatch(/test-with-spaces.*-screenshot\.png/)
  })

  test('should attach screenshot to test info', async () => {
    await captureScreenshotWithInfo(mockPage, mockTestInfo, {
      name: 'test',
      outputDir: tempDir,
    })

    expect(mockTestInfo.attachments.length).toBe(1)
    expect(mockTestInfo.attachments[0].name).toContain('screenshot-test')
    expect(mockTestInfo.attachments[0].contentType).toBe('image/png')
  })
})

