import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { findReplayVideos } from '../src/utils/find-replay-videos.js'
import { getContentType } from '../src/utils/media.js'

test.describe('findReplayVideos', () => {
  let tempDir: string

  test.beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-replays-'))
  })

  test.afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should recursively find Playwright replay video files', () => {
    const nestedDir = path.join(tempDir, 'homepage-test')
    fs.mkdirSync(nestedDir, { recursive: true })
    fs.writeFileSync(path.join(nestedDir, 'video.webm'), 'fake video')
    fs.writeFileSync(path.join(tempDir, 'mobile.mp4'), 'fake video')
    fs.writeFileSync(path.join(tempDir, 'screenshot.png'), 'fake png')

    const videos = findReplayVideos(tempDir).map(filePath => path.relative(tempDir, filePath))

    expect(videos.sort()).toEqual([
      'homepage-test/video.webm',
      'mobile.mp4',
    ].sort())
  })

  test('should reject unsupported files', () => {
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake trace')
    fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'notes')

    expect(findReplayVideos(tempDir)).toEqual([])
  })
})

test.describe('getContentType', () => {
  test('should return video content types for replay files', () => {
    expect(getContentType('video.webm')).toBe('video/webm')
    expect(getContentType('video.mp4')).toBe('video/mp4')
    expect(getContentType('video.mov')).toBe('video/quicktime')
    expect(getContentType('video.m4v')).toBe('video/x-m4v')
  })
})
