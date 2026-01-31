import fs from 'fs'
import path from 'path'

export const MANIFEST_FILENAME = '.screenshots-manifest.json'

export interface ScreenshotManifestEntry {
  /** Group/category for this screenshot (e.g. test file name) */
  group?: string
}

export type ScreenshotManifest = Record<string, ScreenshotManifestEntry>

/**
 * Read the screenshot manifest from a directory
 * Returns an empty object if the manifest doesn't exist or is invalid
 */
export function readManifest(directory: string): ScreenshotManifest {
  const manifestPath = path.join(directory, MANIFEST_FILENAME)
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Write or update a single entry in the screenshot manifest
 * Creates the manifest file if it doesn't exist, appends to it otherwise
 */
export function writeManifestEntry(
  outputDir: string,
  filename: string,
  entry: ScreenshotManifestEntry
): void {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME)
  let manifest: ScreenshotManifest = {}

  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      // If manifest is corrupt, start fresh
    }
  }

  manifest[filename] = entry
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}
