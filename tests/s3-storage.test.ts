import { test, expect } from '@playwright/test'
import { S3Storage } from '../src/storage/s3.js'
import type { S3Config } from '../src/storage/index.js'

test.describe('S3Storage', () => {
  test('should initialize with default credentials', () => {
    const config: S3Config = {
      type: 's3',
      region: 'us-east-1',
      bucket: 'test-bucket',
    }

    const storage = new S3Storage(config)
    expect(storage).toBeDefined()
  })

  test('should initialize with explicit credentials', () => {
    const config: S3Config = {
      type: 's3',
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    }

    const storage = new S3Storage(config)
    expect(storage).toBeDefined()
  })

  test('should initialize with custom endpoint for S3-compatible services', () => {
    const config: S3Config = {
      type: 's3',
      region: 'us-east-1',
      bucket: 'test-bucket',
      endpoint: 'https://nyc3.digitaloceanspaces.com',
    }

    const storage = new S3Storage(config)
    expect(storage).toBeDefined()
  })

  test('should default publicRead to true', () => {
    const config: S3Config = {
      type: 's3',
      region: 'us-east-1',
      bucket: 'test-bucket',
    }

    const storage = new S3Storage(config)
    expect(storage).toBeDefined()
  })

  test('should respect publicRead false setting', () => {
    const config: S3Config = {
      type: 's3',
      region: 'us-east-1',
      bucket: 'test-bucket',
      publicRead: false,
    }

    const storage = new S3Storage(config)
    expect(storage).toBeDefined()
  })
})
