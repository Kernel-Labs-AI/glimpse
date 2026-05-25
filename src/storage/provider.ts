import { StorageProvider, StorageConfig } from './index.js'
import { S3Storage } from './s3.js'
import { VercelBlobStorage } from './vercel-blob.js'

/**
 * Create a storage provider based on the configuration
 */
export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.type) {
    case 's3':
      return new S3Storage(config)
    case 'vercel-blob':
      return new VercelBlobStorage(config)
    default:
      throw new Error(`Unknown storage type: ${(config as any).type}`)
  }
}
