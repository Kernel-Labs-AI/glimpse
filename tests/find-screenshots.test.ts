import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { findScreenshots } from '../src/utils/find-screenshots.js'

test.describe('findScreenshots', () => {
  let tempDir: string

  test.beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-screenshots-'))
  })

  test.afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should find PNG files in a directory', () => {
    // Create test files
    fs.writeFileSync(path.join(tempDir, 'screenshot1.png'), 'fake png')
    fs.writeFileSync(path.join(tempDir, 'screenshot2.png'), 'fake png')
    fs.writeFileSync(path.join(tempDir, 'not-an-image.txt'), 'text file')

    const screenshots = findScreenshots(tempDir)

    expect(screenshots).toHaveLength(2)
    expect(screenshots).toContain(path.join(tempDir, 'screenshot1.png'))
    expect(screenshots).toContain(path.join(tempDir, 'screenshot2.png'))
  })

  test('should find PNG files recursively in subdirectories', () => {
    // Create nested structure
    const subDir = path.join(tempDir, 'subdir')
    fs.mkdirSync(subDir, { recursive: true })
    
    fs.writeFileSync(path.join(tempDir, 'root.png'), 'fake png')
    fs.writeFileSync(path.join(subDir, 'nested.png'), 'fake png')
    fs.writeFileSync(path.join(subDir, 'another.png'), 'fake png')

    const screenshots = findScreenshots(tempDir)

    expect(screenshots).toHaveLength(3)
    expect(screenshots).toContain(path.join(tempDir, 'root.png'))
    expect(screenshots).toContain(path.join(subDir, 'nested.png'))
    expect(screenshots).toContain(path.join(subDir, 'another.png'))
  })

  test('should only find PNG files (case sensitive)', () => {
    // On case-insensitive filesystems, we can't create both .PNG and .png with same name
    // So we test with different base names to verify case sensitivity
    fs.writeFileSync(path.join(tempDir, 'uppercase.PNG'), 'fake png')
    fs.writeFileSync(path.join(tempDir, 'lowercase.png'), 'fake png')
    fs.writeFileSync(path.join(tempDir, 'screenshot.jpg'), 'fake jpg')

    const screenshots = findScreenshots(tempDir)

    // The function uses .endsWith('.png') which is case-sensitive
    // So it should only find lowercase .png files, not .PNG
    expect(screenshots).toHaveLength(1)
    expect(screenshots[0]).toContain('lowercase.png')
    expect(screenshots.some(s => s.includes('.PNG'))).toBe(false)
    expect(screenshots.some(s => s.includes('.jpg'))).toBe(false)
  })

  test('should return empty array when no PNG files exist', () => {
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'text')
    fs.writeFileSync(path.join(tempDir, 'file.jpg'), 'jpg')

    const screenshots = findScreenshots(tempDir)

    expect(screenshots).toHaveLength(0)
  })

  test('should return empty array for empty directory', () => {
    const screenshots = findScreenshots(tempDir)

    expect(screenshots).toHaveLength(0)
  })

  test('should throw error when directory does not exist', () => {
    const nonExistentDir = path.join(tempDir, 'does-not-exist')

    expect(() => {
      findScreenshots(nonExistentDir)
    }).toThrow(`Directory ${nonExistentDir} does not exist`)
  })

  test('should not mutate input', () => {
    // This test ensures the function doesn't have side effects
    fs.writeFileSync(path.join(tempDir, 'screenshot1.png'), 'fake png')
    fs.writeFileSync(path.join(tempDir, 'screenshot2.png'), 'fake png')

    const result1 = findScreenshots(tempDir)
    const result2 = findScreenshots(tempDir)

    // Both calls should return the same result
    expect(result1).toEqual(result2)
    // Results should be independent arrays
    expect(result1).not.toBe(result2)
  })
})

