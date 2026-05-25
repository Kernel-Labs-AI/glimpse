import { test, expect } from '@playwright/test'
import { generateCommentBody, postToGitHub } from '../src/github/comment.js'
import type { UploadedReplay, UploadedScreenshot } from '../src/storage/index.js'

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
      expect(comment).toContain('No screenshots or diffs were selected for this run')
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

  test.describe('diff metadata', () => {
    test('should show compact diff percentages without exposing diff filenames', () => {
      const screenshots: UploadedScreenshot[] = [
        {
          name: 'homepage.diff.png',
          sourceName: 'homepage.png',
          displayName: 'homepage.png',
          url: 'https://example.com/homepage.diff.png',
          path: 'homepage.diff.png',
          kind: 'diff',
          diff: {
            reason: 'pixel-diff',
            percentage: 12.5,
            count: 500,
          },
        },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('Showing the highest-signal visual changes')
      expect(comment).toContain('<br>homepage<br><sub>12.5% diff</sub></a>')
      expect(comment).not.toContain('<br>homepage diff')
    })

    test('should describe layout changes and new screenshots', () => {
      const screenshots: UploadedScreenshot[] = [
        {
          name: 'layout.png',
          url: 'https://example.com/layout.png',
          path: 'layout.png',
          diff: { reason: 'layout-diff' },
        },
        {
          name: 'new.png',
          url: 'https://example.com/new.png',
          path: 'new.png',
          diff: { reason: 'missing-baseline' },
        },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('<sub>layout changed</sub>')
      expect(comment).toContain('<sub>new screenshot</sub>')
    })

    test('should count grouped diff entries as changes', () => {
      const screenshots: UploadedScreenshot[] = [
        {
          name: 'a.diff.png',
          url: 'https://example.com/a.diff.png',
          path: 'a.diff.png',
          group: 'auth.spec.ts',
          diff: { reason: 'pixel-diff', percentage: 1.25 },
        },
        {
          name: 'b.diff.png',
          url: 'https://example.com/b.diff.png',
          path: 'b.diff.png',
          group: 'auth.spec.ts',
          diff: { reason: 'pixel-diff', percentage: 2.5 },
        },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots })

      expect(comment).toContain('<summary><strong>auth.spec.ts</strong> (2 changes)</summary>')
    })
  })

  test.describe('replay videos', () => {
    test('should render uploaded Playwright replays as videos', () => {
      const screenshots: UploadedScreenshot[] = [
        { name: 'homepage.png', url: 'https://example.com/homepage.png', path: 'homepage.png' },
      ]
      const replays: UploadedReplay[] = [
        {
          name: 'video.webm',
          displayName: 'homepage flow',
          url: 'https://example.com/homepage.webm',
          path: 'pr-123/replays/homepage/video.webm',
          relativePath: 'homepage/video.webm',
          contentType: 'video/webm',
        },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots, replays })

      expect(comment).toContain('## 🎥 Playwright Replays')
      expect(comment).toContain('<video src="https://example.com/homepage.webm" width="360" controls></video>')
      expect(comment).toContain('<a href="https://example.com/homepage.webm">homepage flow</a>')
    })

    test('should allow replay-only comments', () => {
      const replays: UploadedReplay[] = [
        {
          name: 'video.webm',
          displayName: 'checkout',
          url: 'https://example.com/checkout.webm',
          path: 'pr-123/replays/checkout/video.webm',
        },
      ]

      const comment = generateCommentBody({ ...baseOptions, screenshots: [], replays })

      expect(comment).toContain('No screenshots or diffs were selected for this run')
      expect(comment).toContain('## 🎥 Playwright Replays')
      expect(comment).toContain('checkout')
    })
  })
})

test.describe('postToGitHub', () => {
  test('should skip creating a comment when no screenshots are selected and no bot comment exists', async () => {
    const calls: string[] = []
    const githubClient = {
      rest: {
        issues: {
          listComments: async () => ({ data: [] }),
          updateComment: async () => calls.push('update'),
          createComment: async () => calls.push('create'),
        },
      },
    }

    await postToGitHub({ ...baseOptions, screenshots: [] }, githubClient)

    expect(calls).toEqual([])
  })

  test('should update an existing bot comment when a later run selects no screenshots', async () => {
    let updatedBody = ''
    const githubClient = {
      rest: {
        issues: {
          listComments: async () => ({
            data: [
              {
                id: 42,
                user: { type: 'Bot' },
                body: '## 📸 UI Screenshots\n\nold screenshots',
              },
            ],
          }),
          updateComment: async ({ body }: { body: string }) => {
            updatedBody = body
          },
          createComment: async () => {
            throw new Error('should not create')
          },
        },
      },
    }

    await postToGitHub({ ...baseOptions, screenshots: [] }, githubClient)

    expect(updatedBody).toContain('No screenshots or diffs were selected for this run')
  })

  test('should create a comment when only replay videos are present', async () => {
    let createdBody = ''
    const githubClient = {
      rest: {
        issues: {
          listComments: async () => ({ data: [] }),
          updateComment: async () => {
            throw new Error('should not update')
          },
          createComment: async ({ body }: { body: string }) => {
            createdBody = body
          },
        },
      },
    }

    await postToGitHub({
      ...baseOptions,
      screenshots: [],
      replays: [
        {
          name: 'video.webm',
          url: 'https://example.com/video.webm',
          path: 'pr-123/replays/video.webm',
        },
      ],
    }, githubClient)

    expect(createdBody).toContain('## 🎥 Playwright Replays')
    expect(createdBody).toContain('https://example.com/video.webm')
  })
})
