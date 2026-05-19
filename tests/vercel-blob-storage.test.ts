import { test, expect } from '@playwright/test'
import { VercelBlobStorage } from '../src/storage/vercel-blob.js'
import type { VercelBlobConfig } from '../src/storage/index.js'

test.describe('VercelBlobStorage', () => {
  test('should initialize with explicit token', () => {
    const config: VercelBlobConfig = {
      type: 'vercel-blob',
      token: 'vercel_blob_rw_test',
    }

    const storage = new VercelBlobStorage(config)
    expect(storage).toBeDefined()
  })

  test('should initialize private access mode', () => {
    const config: VercelBlobConfig = {
      type: 'vercel-blob',
      token: 'vercel_blob_rw_test',
      access: 'private',
    }

    const storage = new VercelBlobStorage(config)
    expect(storage).toBeDefined()
  })
})
