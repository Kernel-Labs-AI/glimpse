import path from 'path'
import fs from 'fs'
import { ReplayUploadOptions, StorageProvider, UploadedReplay } from './storage/index.js'
import { createStorageProvider } from './storage/provider.js'
import { findReplayVideos } from './utils/find-replay-videos.js'
import { generatePathFromTemplate } from './utils/path-template.js'
import { getContentType } from './utils/media.js'

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

function getReplayDisplayName(relativePath: string): string {
  const parsed = path.posix.parse(relativePath)
  const baseName = parsed.name

  if ((baseName === 'video' || baseName === 'replay') && parsed.dir) {
    return path.posix.basename(parsed.dir)
  }

  return baseName
}

/**
 * Upload Playwright replay videos to the configured storage provider.
 */
export async function uploadReplays(
  options: ReplayUploadOptions,
  providerOverride?: StorageProvider
): Promise<UploadedReplay[]> {
  const {
    directory,
    storage,
    pathTemplate = 'pr-{pr}/run-{runId}/replays/{relativePath}',
    prNumber,
    runId,
    commitSha,
    branch,
    allowEmpty = false,
  } = options

  if (!fs.existsSync(directory)) {
    if (allowEmpty) {
      console.log(`No replay videos found in ${directory}`)
      return []
    }
    throw new Error(`Directory ${directory} does not exist`)
  }

  const videos = findReplayVideos(directory)

  if (videos.length === 0) {
    if (allowEmpty) {
      console.log(`No replay videos found in ${directory}`)
      return []
    }
    throw new Error(`No replay videos found in ${directory}`)
  }

  console.log(`Found ${videos.length} replay videos to upload`)

  const provider = providerOverride || createStorageProvider(storage)
  const uploadedReplays: UploadedReplay[] = []

  for (const videoPath of videos) {
    const filename = path.basename(videoPath)
    const relativePath = normalizePath(path.relative(directory, videoPath))
    const remotePath = generatePathFromTemplate(pathTemplate, {
      filename,
      relativePath,
      prNumber,
      runId,
      commitSha,
      branch,
    })
    const contentType = getContentType(videoPath)

    try {
      const url = await provider.upload(videoPath, remotePath, { contentType })
      uploadedReplays.push({
        name: filename,
        url,
        path: remotePath,
        relativePath,
        displayName: getReplayDisplayName(relativePath),
        contentType,
      })
    } catch (error: any) {
      console.error(`Failed to upload ${relativePath}:`, error.message)
    }
  }

  if (uploadedReplays.length === 0) {
    throw new Error('Failed to upload any replay videos')
  }

  console.log(`\n✓ Successfully uploaded ${uploadedReplays.length} replay videos`)

  return uploadedReplays
}
