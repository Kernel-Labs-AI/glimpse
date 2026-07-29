import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { uploadReplays } from '../src/upload-replays.js'
import type { StorageProvider } from '../src/storage/index.js'

test.describe('uploadReplays', () => {
  let tempDir: string

  test.beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-upload-replays-'))
  })

  test.afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('should return an empty list for a missing directory when allowEmpty is true', async () => {
    const replays = await uploadReplays({
      directory: path.join(os.tmpdir(), `missing-replays-${Date.now()}`),
      storage: {
        type: 'vercel-blob',
      },
      allowEmpty: true,
    })

    expect(replays).toEqual([])
  })

  test('should upload nested replay files with stable paths and MIME types', async () => {
    const nestedDir = path.join(tempDir, 'checkout-flow')
    fs.mkdirSync(nestedDir)
    fs.writeFileSync(path.join(nestedDir, 'video.webm'), 'fake webm')
    fs.writeFileSync(path.join(tempDir, 'mobile.mp4'), 'fake mp4')

    const uploads: Array<{ filePath: string; remotePath: string; contentType?: string }> = []
    const provider: StorageProvider = {
      async upload(filePath, remotePath, options) {
        uploads.push({ filePath, remotePath, contentType: options?.contentType })
        return `https://cdn.example.com/${remotePath}`
      },
    }

    const replays = await uploadReplays({
      directory: tempDir,
      storage: {
        type: 's3',
        region: 'us-east-1',
        bucket: 'replays',
      },
      prNumber: 42,
      runId: 99,
    }, provider)

    expect(uploads).toEqual([
      {
        filePath: path.join(nestedDir, 'video.webm'),
        remotePath: 'pr-42/run-99/replays/checkout-flow/video.webm',
        contentType: 'video/webm',
      },
      {
        filePath: path.join(tempDir, 'mobile.mp4'),
        remotePath: 'pr-42/run-99/replays/mobile.mp4',
        contentType: 'video/mp4',
      },
    ])
    expect(replays.map(replay => ({
      displayName: replay.displayName,
      relativePath: replay.relativePath,
      contentType: replay.contentType,
    }))).toEqual([
      {
        displayName: 'checkout-flow',
        relativePath: 'checkout-flow/video.webm',
        contentType: 'video/webm',
      },
      {
        displayName: 'mobile',
        relativePath: 'mobile.mp4',
        contentType: 'video/mp4',
      },
    ])
  })
})
