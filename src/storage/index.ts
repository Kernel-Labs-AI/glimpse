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

export type StorageConfig = SupabaseConfig | S3Config

export interface UploadOptions {
  /** Directory containing screenshots */
  directory: string
  /** Storage configuration */
  storage: StorageConfig
  /** Path template for uploaded files. Variables: {pr}, {runId}, {filename} */
  pathTemplate?: string
  /** PR number */
  prNumber?: string | number
  /** CI run ID */
  runId?: string | number
}

export interface UploadedScreenshot {
  name: string
  url: string
  path: string
}
