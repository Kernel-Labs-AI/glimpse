import { test, expect } from '@playwright/test'
import { generatePathFromTemplate } from '../src/utils/path-template.js'

test.describe('generatePathFromTemplate', () => {
  test('supports existing pr, runId, and filename variables', () => {
    expect(generatePathFromTemplate('pr-{pr}/run-{runId}/{filename}', {
      prNumber: 12,
      runId: 34,
      filename: 'homepage.png',
    })).toBe('pr-12/run-34/homepage.png')
  })

  test('supports commit, branch, and relativePath variables', () => {
    expect(generatePathFromTemplate('glimpse/commit-{commit}/{relativePath}', {
      filename: 'homepage.png',
      relativePath: 'chromium/homepage.png',
      commitSha: 'abc123',
      branch: 'main',
    })).toBe('glimpse/commit-abc123/chromium/homepage.png')
  })

  test('uses filename as relativePath fallback', () => {
    expect(generatePathFromTemplate('screens/{relativePath}', {
      filename: 'homepage.png',
    })).toBe('screens/homepage.png')
  })
})
