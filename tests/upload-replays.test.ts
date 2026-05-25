import { test, expect } from '@playwright/test'
import path from 'path'
import os from 'os'
import { uploadReplays } from '../src/upload-replays.js'

test.describe('uploadReplays', () => {
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
})
