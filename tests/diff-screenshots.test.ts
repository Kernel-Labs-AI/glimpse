import { test, expect } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { selectScreenshotsForUpload } from '../src/utils/diff-screenshots.js'

test.describe('selectScreenshotsForUpload', () => {
  let tempDir: string
  let currentDir: string
  let baselineDir: string

  test.beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-diff-screenshots-'))
    currentDir = path.join(tempDir, 'current')
    baselineDir = path.join(tempDir, 'baseline')
    fs.mkdirSync(currentDir, { recursive: true })
    fs.mkdirSync(baselineDir, { recursive: true })
  })

  test.afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  function writePair(name: string) {
    fs.writeFileSync(path.join(currentDir, name), 'current')
    fs.writeFileSync(path.join(baselineDir, name), 'baseline')
  }

  test('passes screenshots through unchanged when diffing is disabled', async () => {
    const first = path.join(currentDir, 'b.png')
    const second = path.join(currentDir, 'a.png')
    fs.writeFileSync(first, 'b')
    fs.writeFileSync(second, 'a')

    const selection = await selectScreenshotsForUpload({
      directory: currentDir,
      screenshots: [first, second],
    })

    expect(selection.candidates.map(c => c.name)).toEqual(['a.png', 'b.png'])
    expect(selection.candidates.map(c => c.relativePath)).toEqual(['a.png', 'b.png'])
    expect(selection.candidates.every(c => c.kind === 'screenshot')).toBe(true)
    expect(selection.cleanup).toBeUndefined()
  })

  test('uploads generated diff images when requested and filters below the percentage threshold', async () => {
    writePair('same.png')
    writePair('low.png')
    writePair('high.png')

    const selection = await selectScreenshotsForUpload({
      directory: currentDir,
      screenshots: [
        path.join(currentDir, 'same.png'),
        path.join(currentDir, 'low.png'),
        path.join(currentDir, 'high.png'),
      ],
      diff: {
        baselineDirectory: baselineDir,
        uploadMode: 'diffs',
        minDiffPercentage: 1,
      },
      compareImages: async (_basePath, comparePath, diffOutputPath) => {
        const name = path.basename(comparePath)
        if (name === 'same.png') return { match: true }
        fs.writeFileSync(diffOutputPath, 'diff')
        if (name === 'low.png') {
          return { match: false, reason: 'pixel-diff', diffCount: 10, diffPercentage: 0.2 }
        }
        return { match: false, reason: 'pixel-diff', diffCount: 500, diffPercentage: 12.5 }
      },
    })

    expect(selection.candidates).toHaveLength(1)
    expect(selection.candidates[0]).toMatchObject({
      name: 'high.diff.png',
      sourceName: 'high.png',
      displayName: 'high.png',
      kind: 'diff',
      relativePath: 'high.diff.png',
      sourceRelativePath: 'high.png',
      diff: {
        reason: 'pixel-diff',
        percentage: 12.5,
        count: 500,
      },
    })
    expect(fs.existsSync(selection.candidates[0].uploadPath)).toBe(true)

    const uploadPath = selection.candidates[0].uploadPath
    selection.cleanup?.()
    expect(fs.existsSync(uploadPath)).toBe(false)
  })

  test('keeps the current screenshot when diff mode is screenshots', async () => {
    writePair('changed.png')
    const screenshotPath = path.join(currentDir, 'changed.png')

    const selection = await selectScreenshotsForUpload({
      directory: currentDir,
      screenshots: [screenshotPath],
      diff: {
        baselineDirectory: baselineDir,
        uploadMode: 'screenshots',
      },
      compareImages: async (_basePath, _comparePath, diffOutputPath) => {
        fs.writeFileSync(diffOutputPath, 'diff')
        return { match: false, reason: 'pixel-diff', diffCount: 20, diffPercentage: 2.5 }
      },
    })

    expect(selection.candidates).toHaveLength(1)
    expect(selection.candidates[0].uploadPath).toBe(screenshotPath)
    expect(selection.candidates[0].name).toBe('changed.png')
    expect(selection.candidates[0].kind).toBe('screenshot')
    selection.cleanup?.()
  })

  test('includes missing baselines and layout diffs because they are high-signal changes', async () => {
    fs.writeFileSync(path.join(currentDir, 'new.png'), 'current')
    writePair('layout.png')
    writePair('pixel.png')

    const selection = await selectScreenshotsForUpload({
      directory: currentDir,
      screenshots: [
        path.join(currentDir, 'pixel.png'),
        path.join(currentDir, 'new.png'),
        path.join(currentDir, 'layout.png'),
      ],
      diff: {
        baselineDirectory: baselineDir,
        uploadMode: 'diffs',
        minDiffPercentage: 50,
      },
      compareImages: async (_basePath, comparePath, diffOutputPath) => {
        const name = path.basename(comparePath)
        fs.writeFileSync(diffOutputPath, 'diff')
        if (name === 'layout.png') return { match: false, reason: 'layout-diff' }
        return { match: false, reason: 'pixel-diff', diffCount: 200, diffPercentage: 60 }
      },
    })

    expect(selection.candidates.map(c => c.sourceName)).toEqual(['layout.png', 'new.png', 'pixel.png'])
    expect(selection.candidates.map(c => c.diff?.reason)).toEqual(['layout-diff', 'missing-baseline', 'pixel-diff'])
    selection.cleanup?.()
  })

  test('rejects invalid percentage thresholds', async () => {
    fs.writeFileSync(path.join(currentDir, 'test.png'), 'current')

    await expect(selectScreenshotsForUpload({
      directory: currentDir,
      screenshots: [path.join(currentDir, 'test.png')],
      diff: {
        baselineDirectory: baselineDir,
        minDiffPercentage: 101,
      },
      compareImages: async () => ({ match: true }),
    })).rejects.toThrow('minDiffPercentage must be a number between 0 and 100')
  })

  test('downloads storage-backed baselines using the rendered baseline path template', async () => {
    const nestedDir = path.join(currentDir, 'chromium')
    fs.mkdirSync(nestedDir, { recursive: true })
    const screenshotPath = path.join(nestedDir, 'dashboard.png')
    fs.writeFileSync(screenshotPath, 'current')

    const requestedPaths: string[] = []

    const selection = await selectScreenshotsForUpload({
      directory: currentDir,
      screenshots: [screenshotPath],
      diff: {
        baselineStorage: {
          pathTemplate: 'glimpse-screenshots/commit-{commit}/{relativePath}',
          commitSha: 'base-sha',
          storage: {
            type: 'vercel-blob',
            token: 'token',
          },
        },
        uploadMode: 'diffs',
      },
      downloadBaseline: async (remotePath) => {
        requestedPaths.push(remotePath)
        return Buffer.from('baseline')
      },
      compareImages: async (basePath, _comparePath, diffOutputPath) => {
        expect(fs.readFileSync(basePath, 'utf8')).toBe('baseline')
        fs.mkdirSync(path.dirname(diffOutputPath), { recursive: true })
        fs.writeFileSync(diffOutputPath, 'diff')
        return { match: false, reason: 'pixel-diff', diffCount: 25, diffPercentage: 4 }
      },
    })

    expect(requestedPaths).toEqual(['glimpse-screenshots/commit-base-sha/chromium/dashboard.png'])
    expect(selection.candidates).toHaveLength(1)
    expect(selection.candidates[0]).toMatchObject({
      name: 'dashboard.diff.png',
      relativePath: 'chromium/dashboard.diff.png',
      sourceRelativePath: 'chromium/dashboard.png',
      kind: 'diff',
      diff: {
        reason: 'pixel-diff',
        percentage: 4,
      },
    })

    selection.cleanup?.()
  })

  test('marks missing storage-backed baselines without running odiff', async () => {
    const screenshotPath = path.join(currentDir, 'new.png')
    fs.writeFileSync(screenshotPath, 'current')

    const selection = await selectScreenshotsForUpload({
      directory: currentDir,
      screenshots: [screenshotPath],
      diff: {
        baselineStorage: {
          pathTemplate: 'glimpse-screenshots/commit-{commit}/{relativePath}',
          commitSha: 'base-sha',
          storage: {
            type: 'vercel-blob',
            token: 'token',
          },
        },
      },
      downloadBaseline: async () => undefined,
      compareImages: async () => {
        throw new Error('should not compare without a baseline')
      },
    })

    expect(selection.candidates).toHaveLength(1)
    expect(selection.candidates[0].diff?.reason).toBe('missing-baseline')
    expect(selection.candidates[0].uploadPath).toBe(screenshotPath)
  })
})
