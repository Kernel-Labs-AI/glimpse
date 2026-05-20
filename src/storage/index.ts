import type { ODiffOptions } from 'odiff-bin'

/**
 * Storage provider interface for uploading screenshots
 */
export interface StorageProvider {
  /**
   * Upload a screenshot file
   * @param filePath - Local path to the screenshot file
   * @param remotePath - Remote path where the file should be stored
   * @returns Public URL of the uploaded file
   */
  upload(filePath: string, remotePath: string): Promise<string>

  /**
   * Download a screenshot file from storage.
   * Returns undefined when the remote file does not exist.
   */
  download?(remotePath: string): Promise<Buffer | undefined>

  /**
   * Initialize the storage provider (create buckets, etc.)
   */
  initialize?(): Promise<void>
}

export interface SupabaseConfig {
  type: 'supabase'
  url: string
  key: string
  bucket?: string
}

export interface S3Config {
  type: 's3'
  region: string
  bucket: string
  accessKeyId?: string
  secretAccessKey?: string
  /** Optional: custom endpoint for S3-compatible services */
  endpoint?: string
  /** Optional: make uploads public (default: true) */
  publicRead?: boolean
}

export interface VercelBlobConfig {
  type: 'vercel-blob'
  /** Vercel Blob read/write token. Defaults to VERCEL_BLOB_READ_WRITE_TOKEN or BLOB_READ_WRITE_TOKEN. */
  token?: string
}

export type StorageConfig = SupabaseConfig | S3Config | VercelBlobConfig

export type ScreenshotUploadMode = 'screenshots' | 'diffs'

export interface ScreenshotBaselineStorageOptions {
  /** Storage configuration to download baselines from. Defaults to the upload storage. */
  storage?: StorageConfig
  /** Remote path template for baseline files. Variables: {pr}, {runId}, {commit}, {branch}, {filename}, {relativePath} */
  pathTemplate: string
  /** PR number used by the baseline path template */
  prNumber?: string | number
  /** Run ID used by the baseline path template */
  runId?: string | number
  /** Commit SHA used by the baseline path template */
  commitSha?: string | number
  /** Branch name used by the baseline path template */
  branch?: string
  /** Directory where downloaded baseline images should be written. Defaults to a temporary directory. */
  downloadDirectory?: string
}

export interface ScreenshotDiffOptions {
  /** Directory containing baseline screenshots, matched by relative path */
  baselineDirectory?: string
  /** Storage-backed baseline screenshots, matched by rendered remote path */
  baselineStorage?: ScreenshotBaselineStorageOptions
  /** Upload current screenshots or generated diff images when changes are found */
  uploadMode?: ScreenshotUploadMode
  /** Minimum odiff diffPercentage required before uploading pixel diffs (0-100) */
  minDiffPercentage?: number
  /** Directory for generated diff images. Defaults to a temporary directory. */
  diffOutputDirectory?: string
  /** Options passed through to odiff */
  odiffOptions?: ODiffOptions
}

export interface UploadOptions {
  /** Directory containing screenshots */
  directory: string
  /** Storage configuration */
  storage: StorageConfig
  /** Path template for uploaded files. Variables: {pr}, {runId}, {commit}, {branch}, {filename}, {relativePath} */
  pathTemplate?: string
  /** PR number */
  prNumber?: string | number
  /** CI run ID */
  runId?: string | number
  /** Commit SHA for upload path templates */
  commitSha?: string | number
  /** Branch name for upload path templates */
  branch?: string
  /** Optional visual diff filtering/generation configuration */
  diff?: ScreenshotDiffOptions
}

export type UploadedScreenshotKind = 'screenshot' | 'diff'

export type UploadedScreenshotDiffReason =
  | 'pixel-diff'
  | 'layout-diff'
  | 'missing-baseline'

export interface UploadedScreenshotDiff {
  /** Why this screenshot was selected for upload */
  reason: UploadedScreenshotDiffReason
  /** Percentage of changed pixels reported by odiff for pixel diffs */
  percentage?: number
  /** Count of changed pixels reported by odiff for pixel diffs */
  count?: number
  /** Local baseline path used for comparison */
  baselinePath?: string
  /** Local current screenshot path used for comparison */
  comparisonPath?: string
}

export interface UploadedScreenshot {
  name: string
  url: string
  path: string
  /** Group/category for this screenshot (e.g. test file name) */
  group?: string
  /** Whether the uploaded image is an original screenshot or a generated diff */
  kind?: UploadedScreenshotKind
  /** Original screenshot filename when the uploaded file is a diff */
  sourceName?: string
  /** Display label to use in generated comments */
  displayName?: string
  /** Uploaded image path relative to the screenshot root */
  relativePath?: string
  /** Source screenshot path relative to the screenshot root */
  sourceRelativePath?: string
  /** Visual diff metadata when diff filtering was enabled */
  diff?: UploadedScreenshotDiff
}
