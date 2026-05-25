import path from 'path'
import { UploadOptions, UploadedScreenshot } from './storage/index.js'
import { createStorageProvider } from './storage/provider.js'
import { findScreenshots } from './utils/find-screenshots.js'
import { readManifest } from './utils/manifest.js'
import { selectScreenshotsForUpload } from './utils/diff-screenshots.js'
import { generatePathFromTemplate } from './utils/path-template.js'

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
    runId,
    commitSha,
    branch
  } = options

  // Find all screenshots
  const screenshots = findScreenshots(directory)

  if (screenshots.length === 0) {
    throw new Error(`No screenshots found in ${directory}`)
  }

  console.log(
    options.diff
      ? `Found ${screenshots.length} screenshots to compare`
      : `Found ${screenshots.length} screenshots to upload`
  )

  // Read manifests per-directory (screenshots may live in subdirectories,
  // each with their own manifest written during capture)
  const manifestCache = new Map<string, ReturnType<typeof readManifest>>()
  function getManifest(screenshotPath: string) {
    const dir = path.dirname(screenshotPath)
    if (!manifestCache.has(dir)) {
      manifestCache.set(dir, readManifest(dir))
    }
    return manifestCache.get(dir)!
  }

  const diff = options.diff?.baselineStorage && !options.diff.baselineStorage.storage
    ? {
        ...options.diff,
        baselineStorage: {
          ...options.diff.baselineStorage,
          storage,
        },
      }
    : options.diff

  const selection = await selectScreenshotsForUpload({ directory, screenshots, diff })

  if (selection.candidates.length === 0) {
    console.log('\n✓ No screenshots exceeded the configured diff threshold')
    selection.cleanup?.()
    return []
  }

  // Create storage provider
  const provider = createStorageProvider(storage)

  const uploadedScreenshots: UploadedScreenshot[] = []

  try {
    // Upload selected screenshots or generated diffs
    for (const candidate of selection.candidates) {
      const sourceFilename = path.basename(candidate.sourcePath)
      const remotePath = generatePathFromTemplate(pathTemplate, {
        filename: candidate.name,
        relativePath: candidate.relativePath,
        prNumber,
        runId,
        commitSha,
        branch,
      })
      const manifestEntry = getManifest(candidate.sourcePath)[sourceFilename]

      try {
        const url = await provider.upload(candidate.uploadPath, remotePath, { contentType: 'image/png' })
        uploadedScreenshots.push({
          name: candidate.name,
          url,
          path: remotePath,
          ...(manifestEntry?.group ? { group: manifestEntry.group } : {}),
          ...(candidate.kind ? { kind: candidate.kind } : {}),
          ...(candidate.sourceName ? { sourceName: candidate.sourceName } : {}),
          ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
          relativePath: candidate.relativePath,
          sourceRelativePath: candidate.sourceRelativePath,
          ...(candidate.diff ? { diff: candidate.diff } : {}),
        })
      } catch (error: any) {
        console.error(`Failed to upload ${candidate.name}:`, error.message)
        // Continue with other files
      }
    }
  } finally {
    selection.cleanup?.()
  }

  if (uploadedScreenshots.length === 0) {
    throw new Error('Failed to upload any screenshots')
  }

  console.log(`\n✓ Successfully uploaded ${uploadedScreenshots.length} screenshots`)

  return uploadedScreenshots
}
