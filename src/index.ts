/**
 * playwright-pr-review
 * Upload Playwright screenshots to Supabase/S3 and post to GitHub PR comments
 */

// Export main functionality
export { uploadScreenshots } from './upload.js'
export { postToGitHub, generateCommentBody } from './github/comment.js'

// Export types
export type {
  StorageProvider,
  StorageConfig,
  SupabaseConfig,
  S3Config,
  UploadOptions,
  UploadedScreenshot
} from './storage/index.js'

export type { GitHubCommentOptions } from './github/comment.js'

// Export storage providers (for advanced usage)
export { SupabaseStorage } from './storage/supabase.js'
export { S3Storage } from './storage/s3.js'

// Export utilities
export { findScreenshots } from './utils/find-screenshots.js'
