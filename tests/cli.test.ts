import { test, expect } from '@playwright/test'
import { generateCommentBody } from '../src/github/comment.js'
import type { UploadedScreenshot } from '../src/storage/index.js'

test.describe('CLI Integration Tests', () => {
  test('generateCommentBody should handle various screenshot formats', () => {
    const screenshots: UploadedScreenshot[] = [
      { name: 'homepage.png', url: 'https://example.com/homepage.png', path: 'pr-123/homepage.png' },
      { name: 'dashboard.png', url: 'https://example.com/dashboard.png', path: 'pr-123/dashboard.png' },
    ]

    const comment = generateCommentBody({
      screenshots,
      prNumber: 123,
      token: 'fake-token',
      owner: 'test-owner',
      repo: 'test-repo',
    })

    expect(comment).toContain('## 📸 UI Screenshots')
    expect(comment).toContain('homepage.png')
    expect(comment).toContain('dashboard.png')
  })

  test('generateCommentBody should format names correctly', () => {
    const screenshots: UploadedScreenshot[] = [
      { name: 'my-homepage-screenshot.png', url: 'https://example.com/img.png', path: 'path.png' },
    ]

    const comment = generateCommentBody({
      screenshots,
      prNumber: 123,
      token: 'fake-token',
      owner: 'test-owner',
      repo: 'test-repo',
    })

    expect(comment).toContain('### my homepage screenshot')
  })
})

