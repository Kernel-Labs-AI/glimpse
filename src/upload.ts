import path from 'path'
import { StorageProvider, UploadOptions, UploadedScreenshot } from './storage/index.js'
import { SupabaseStorage } from './storage/supabase.js'
import { S3Storage } from './storage/s3.js'
import { findScreenshots } from './utils/find-screenshots.js'

/**
 * Create a storage provider based on the configuration
 */
function createStorageProvider(config: UploadOptions['storage']): StorageProvider {
  switch (config.type) {
    case 'supabase':
      return new SupabaseStorage(config)
    case 's3':
      return new S3Storage(config)
    default:
      throw new Error(`Unknown storage type: ${(config as any).type}`)
  }
}

/**
 * Generate remote path from template
 */
function generateRemotePath(
  template: string,
  filename: string,
  prNumber?: string | number,
  runId?: string | number
): string {
  return template
    .replace('{pr}', String(prNumber || 'unknown'))
    .replace('{runId}', String(runId || Date.now()))
    .replace('{filename}', filename)
}

/**
 * Upload screenshots to the configured storage provider
 */
export async function uploadScreenshots(
  options: UploadOptions
): Promise<UploadedScreenshot[]> {
  const {
    directory,
    storage,
    pathTemplate = 'pr-{pr}/run-{runId}/{filename}',
    prNumber,
    runId
  } = options

  // Find all screenshots
  const screenshots = findScreenshots(directory)

  if (screenshots.length === 0) {
    throw new Error(`No screenshots found in ${directory}`)
  }

  console.log(`Found ${screenshots.length} screenshots to upload`)

  // Create storage provider
  const provider = createStorageProvider(storage)

  // Initialize provider if needed
  if (provider.initialize) {
    await provider.initialize()
  }

  const uploadedScreenshots: UploadedScreenshot[] = []

  // Upload each screenshot
  for (const screenshotPath of screenshots.sort()) {
    const filename = path.basename(screenshotPath)
    const remotePath = generateRemotePath(pathTemplate, filename, prNumber, runId)

    try {
      const url = await provider.upload(screenshotPath, remotePath)
      uploadedScreenshots.push({
        name: filename,
        url,
        path: remotePath
      })
    } catch (error: any) {
      console.error(`Failed to upload ${filename}:`, error.message)
      // Continue with other files
    }
  }

  if (uploadedScreenshots.length === 0) {
    throw new Error('Failed to upload any screenshots')
  }

  console.log(`\n✓ Successfully uploaded ${uploadedScreenshots.length} screenshots`)

  return uploadedScreenshots
}
