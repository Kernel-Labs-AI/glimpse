/**
 * Glimpse
 * Upload Playwright screenshots and replay videos to S3 or Vercel Blob and post to GitHub PR comments
 */

// Export main functionality
export { uploadScreenshots } from './upload.js'
export { uploadReplays } from './upload-replays.js'
export { postToGitHub, generateCommentBody } from './github/comment.js'

// Export types
export type {
  StorageProvider,
  StorageConfig,
  S3Config,
  VercelBlobConfig,
  UploadOptions,
  ReplayUploadOptions,
  UploadedScreenshot,
  UploadedReplay,
  ScreenshotDiffOptions,
  ScreenshotBaselineStorageOptions,
  ScreenshotUploadMode,
  UploadedScreenshotDiff,
  UploadedScreenshotDiffReason,
  UploadedScreenshotKind
} from './storage/index.js'

export type { GitHubCommentOptions } from './github/comment.js'

// Export storage providers (for advanced usage)
export { S3Storage } from './storage/s3.js'
export { VercelBlobStorage } from './storage/vercel-blob.js'

// Export utilities
export { findScreenshots } from './utils/find-screenshots.js'
export { findReplayVideos } from './utils/find-replay-videos.js'
export { readManifest, MANIFEST_FILENAME } from './utils/manifest.js'
export type { ScreenshotManifest, ScreenshotManifestEntry } from './utils/manifest.js'
