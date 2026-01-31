import { test, expect } from '@playwright/test'
import { generateCommentBody } from '../src/github/comment.js'
import type { UploadedScreenshot } from '../src/storage/index.js'

const baseOptions = {
  prNumber: 123,
  token: 'fake-token',
  owner: 'test-owner',
  repo: 'test-repo',
}

test.describe('generateCommentBody', () => {
  test.describe('thumbnail grid (ungrouped)', () => {
    test('should generate a thumbnail grid for screenshots without groups', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'homepage.png', url: 'https://example.com/homepage.png', path: 'pr-123/homepage.png' },
        { name: 'dashboard.png', url: 'https://example.com/dashboard.png', path: 'pr-123/dashboard.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('## 📸 UI Screenshots')
      expect(comment).toContain('|---|---|---|')
      expect(comment).toContain('<img src="https://example.com/homepage.png" width="280">')
      expect(comment).toContain('<img src="https://example.com/dashboard.png" width="280">')
      expect(comment).toContain('<a href="https://example.com/homepage.png">')
      expect(comment).toContain('<br>homepage')
      expect(comment).toContain('<br>dashboard')
    })

    test('should format screenshot names in grid cells', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'my-homepage-screenshot.png', url: 'https://example.com/img.png', path: 'path.png' },
        { name: 'dashboard_view.png', url: 'https://example.com/img2.png', path: 'path2.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('<br>my homepage screenshot</a>')
      expect(comment).toContain('<br>dashboard view</a>')
    })

    test('should produce 3-column rows', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'a.png', url: 'https://example.com/a.png', path: 'a.png' },
        { name: 'b.png', url: 'https://example.com/b.png', path: 'b.png' },
        { name: 'c.png', url: 'https://example.com/c.png', path: 'c.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      // All three should be in the same row
      const lines = comment.split('\n')
      const dataRows = lines.filter(l => l.startsWith('| <a'))
      expect(dataRows).toHaveLength(1) // 3 items = 1 row
      expect(dataRows[0]).toContain('a.png')
      expect(dataRows[0]).toContain('b.png')
      expect(dataRows[0]).toContain('c.png')
    })

    test('should pad partial last row with empty cells', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'a.png', url: 'https://example.com/a.png', path: 'a.png' },
        { name: 'b.png', url: 'https://example.com/b.png', path: 'b.png' },
        { name: 'c.png', url: 'https://example.com/c.png', path: 'c.png' },
        { name: 'd.png', url: 'https://example.com/d.png', path: 'd.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      const lines = comment.split('\n')
      const dataRows = lines.filter(l => l.startsWith('| <a') || l.match(/^\| .* \|  \|$/))
      expect(dataRows).toHaveLength(2) // 4 items = 2 rows
    })

    test('should handle single screenshot', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'only.png', url: 'https://example.com/only.png', path: 'only.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('<img src="https://example.com/only.png" width="280">')
      expect(comment).toContain('|---|---|---|')
    })
  })

  test.describe('grouped layout', () => {
    test('should wrap groups in details/summary sections', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'login.png', url: 'https://example.com/login.png', path: 'login.png', group: 'auth.spec.ts' },
        { name: 'signup.png', url: 'https://example.com/signup.png', path: 'signup.png', group: 'auth.spec.ts' },
        { name: 'deck-list.png', url: 'https://example.com/deck-list.png', path: 'deck-list.png', group: 'decks.spec.ts' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('<details>')
      expect(comment).toContain('<summary><strong>auth.spec.ts</strong> (2 screenshots)</summary>')
      expect(comment).toContain('<summary><strong>decks.spec.ts</strong> (1 screenshot)</summary>')
      expect(comment).toContain('</details>')
    })

    test('should include thumbnail grid inside each group', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'login.png', url: 'https://example.com/login.png', path: 'login.png', group: 'auth.spec.ts' },
        { name: 'deck-list.png', url: 'https://example.com/deck-list.png', path: 'deck-list.png', group: 'decks.spec.ts' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      // Each group should have its own grid
      const gridHeaderCount = (comment.match(/\|---\|---\|---\|/g) || []).length
      expect(gridHeaderCount).toBe(2) // one per group
    })

    test('should put ungrouped screenshots in "Other" group', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'login.png', url: 'https://example.com/login.png', path: 'login.png', group: 'auth.spec.ts' },
        { name: 'misc.png', url: 'https://example.com/misc.png', path: 'misc.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('<summary><strong>auth.spec.ts</strong> (1 screenshot)</summary>')
      expect(comment).toContain('<summary><strong>Other</strong> (1 screenshot)</summary>')
    })

    test('should use singular "screenshot" for single-item groups', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'login.png', url: 'https://example.com/login.png', path: 'login.png', group: 'auth.spec.ts' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('(1 screenshot)')
      expect(comment).not.toContain('(1 screenshots)')
    })

    test('should use plural "screenshots" for multi-item groups', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'a.png', url: 'https://example.com/a.png', path: 'a.png', group: 'test.spec.ts' },
        { name: 'b.png', url: 'https://example.com/b.png', path: 'b.png', group: 'test.spec.ts' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('(2 screenshots)')
    })

    test('should not use details/summary when no screenshots have groups', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'a.png', url: 'https://example.com/a.png', path: 'a.png' },
        { name: 'b.png', url: 'https://example.com/b.png', path: 'b.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).not.toContain('<details>')
      expect(comment).not.toContain('<summary>')
      expect(comment).toContain('|---|---|---|')
    })
  })

  test.describe('footer and metadata', () => {
    test('should include run ID link when provided', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'test.png', url: 'https://example.com/test.png', path: 'test.png' },
      ]

      const comment = generateCommentBody({
        ...baseOptions,
        screenshots,
        runId: '456789',
        repositoryUrl: 'https://github.com/test-owner/test-repo',
      })

      expect(comment).toContain('GitHub Actions')
      expect(comment).toContain('https://github.com/test-owner/test-repo/actions/runs/456789')
    })

    test('should include fallback text when run ID not provided', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'test.png', url: 'https://example.com/test.png', path: 'test.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('🤖 Generated by automated screenshot workflow')
      expect(comment).not.toContain('GitHub Actions')
    })
  })

  test.describe('edge cases', () => {
    test('should handle empty screenshots array', () => {
      const comment = generateCommentBody({ ...baseOptions, screenshots: [] })

      expect(comment).toContain('## 📸 UI Screenshots')
      expect(comment).toContain('Automated screenshots from the latest build')
    })

    test('should handle special characters in screenshot names', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'test@123#special.png', url: 'https://example.com/test.png', path: 'test.png' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('test@123#special')
      expect(comment).toContain('https://example.com/test.png')
    })

    test('should handle special characters in group names', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'test.png', url: 'https://example.com/test.png', path: 'test.png', group: 'tests/e2e/auth.spec.ts' },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('<strong>tests/e2e/auth.spec.ts</strong>')
    })
  })
})
