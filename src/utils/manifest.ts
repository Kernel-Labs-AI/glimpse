import fs from 'fs'
import path from 'path'

export const MANIFEST_FILENAME = '.screenshots-manifest.json'

export interface ScreenshotManifestEntry {
  /** Group/category for this screenshot (e.g. test file name) */
  group?: string
}

export type ScreenshotManifest = Record<string, ScreenshotManifestEntry>

/**
 * Read the screenshot manifest from a directory.
 * Supports both NDJSON (current format, one JSON object per line) and
 * plain JSON (legacy format, single object keyed by filename).
 * Returns an empty object if the manifest doesn't exist or is invalid.
 */
export function readManifest(directory: string): ScreenshotManifest {
  const manifestPath = path.join(directory, MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) return {}

  const content = fs.readFileSync(manifestPath, 'utf8')
  if (!content.trim()) return {}

  // Try NDJSON format (current): one {"filename":"x.png","group":"y"} per line
  const manifest: ScreenshotManifest = {}
  let parsedAny = false
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      const { filename, ...entry } = JSON.parse(line)
      if (filename) {
        manifest[filename] = entry
        parsedAny = true
      }
    } catch {
      // skip malformed lines
    }
  }
  if (parsedAny) return manifest

  // Fallback: legacy plain-JSON format (Record<string, ScreenshotManifestEntry>)
  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * Append a single entry to the screenshot manifest.
 * Uses fs.appendFileSync with NDJSON (one JSON object per line) so that
 * concurrent Playwright workers can safely write without losing entries.
 * On Linux, O_APPEND writes under PIPE_BUF (4 KB) are atomic.
 */
export function writeManifestEntry(
  outputDir: string,
  filename: string,
  entry: ScreenshotManifestEntry
): void {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME)
  const line = JSON.stringify({ filename, ...entry }) + '\n'
  fs.appendFileSync(manifestPath, line)
}
