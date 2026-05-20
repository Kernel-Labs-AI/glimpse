import fs from 'fs'
import os from 'os'
import path from 'path'
import { ODiffServer, type ODiffOptions, type ODiffResult } from 'odiff-bin'
import type {
  ScreenshotDiffOptions,
  ScreenshotUploadMode,
  UploadedScreenshotDiff,
  UploadedScreenshotKind,
} from '../storage/index.js'
import { createStorageProvider } from '../storage/provider.js'
import { generatePathFromTemplate } from './path-template.js'

export interface ScreenshotUploadCandidate {
  /** Original current screenshot path */
  sourcePath: string
  /** Local file path that should be uploaded */
  uploadPath: string
  /** Filename to use in remote paths and serialized output */
  name: string
  /** Relative upload path to use in path templates */
  relativePath: string
  /** Original current screenshot path relative to the screenshots directory */
  sourceRelativePath: string
  /** Original screenshot filename */
  sourceName?: string
  /** Display label for comments */
  displayName?: string
  /** Uploaded image type */
  kind?: UploadedScreenshotKind
  /** Diff metadata for comment rendering and downstream filtering */
  diff?: UploadedScreenshotDiff
}

type CompareImages = (
  basePath: string,
  comparePath: string,
  diffOutputPath: string,
  options?: ODiffOptions & { timeout?: number }
) => Promise<ODiffResult>

type DownloadBaseline = (remotePath: string) => Promise<Buffer | undefined>
type StoppableODiffServer = ODiffServer & { exiting?: boolean }

interface SelectScreenshotsOptions {
  directory: string
  screenshots: string[]
  diff?: ScreenshotDiffOptions
  compareImages?: CompareImages
  downloadBaseline?: DownloadBaseline
}

interface SelectedScreenshots {
  candidates: ScreenshotUploadCandidate[]
  cleanup?: () => void
}

type NormalizedScreenshotDiffOptions = ScreenshotDiffOptions & {
  baselineDirectory?: string
  uploadMode: ScreenshotUploadMode
  minDiffPercentage: number
}

function validateDiffOptions(diff: ScreenshotDiffOptions): NormalizedScreenshotDiffOptions {
  const uploadMode = diff.uploadMode || 'screenshots'
  if (uploadMode !== 'screenshots' && uploadMode !== 'diffs') {
    throw new Error(`Unknown diff upload mode: ${uploadMode}`)
  }

  const minDiffPercentage = diff.minDiffPercentage ?? 0
  if (!Number.isFinite(minDiffPercentage) || minDiffPercentage < 0 || minDiffPercentage > 100) {
    throw new Error('minDiffPercentage must be a number between 0 and 100')
  }

  if (diff.baselineDirectory && diff.baselineStorage) {
    throw new Error('Diff options must not set both baselineDirectory and baselineStorage')
  }

  if (diff.baselineDirectory && !fs.existsSync(diff.baselineDirectory)) {
    console.warn(`Diff baseline directory ${diff.baselineDirectory} does not exist; treating screenshots as new`)
  }

  return {
    ...diff,
    uploadMode,
    minDiffPercentage,
  }
}

function getDiffOutputPath(outputDir: string, relativeScreenshotPath: string): string {
  const parsed = path.parse(relativeScreenshotPath)
  return path.join(outputDir, parsed.dir, `${parsed.name}.diff.png`)
}

function createChangedScreenshotCandidate(
  screenshotPath: string,
  sourceRelativePath: string,
  baselinePath: string,
  uploadPath: string,
  relativePath: string,
  kind: UploadedScreenshotKind,
  diff: UploadedScreenshotDiff
): ScreenshotUploadCandidate {
  const sourceName = path.basename(screenshotPath)
  return {
    sourcePath: screenshotPath,
    uploadPath,
    name: path.basename(uploadPath),
    relativePath,
    sourceRelativePath,
    sourceName,
    displayName: sourceName,
    kind,
    diff: {
      ...diff,
      baselinePath,
      comparisonPath: screenshotPath,
    },
  }
}

function compareByLargestDiff(a: ScreenshotUploadCandidate, b: ScreenshotUploadCandidate): number {
  const aPercentage = a.diff?.reason === 'pixel-diff' ? a.diff.percentage ?? 0 : 101
  const bPercentage = b.diff?.reason === 'pixel-diff' ? b.diff.percentage ?? 0 : 101
  if (aPercentage !== bPercentage) {
    return bPercentage - aPercentage
  }
  return a.sourcePath.localeCompare(b.sourcePath)
}

async function createDefaultCompareImages(): Promise<{ compareImages: CompareImages; stop: () => void }> {
  const server = new ODiffServer()
  return {
    compareImages: server.compare.bind(server),
    stop: () => {
      server.stop()
      // odiff-bin resets this before its async exit handler runs, causing a false warning on normal shutdown.
      ;(server as StoppableODiffServer).exiting = true
    },
  }
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}

function getDiffRelativePath(relativeScreenshotPath: string): string {
  const parsed = path.parse(relativeScreenshotPath)
  return normalizeRelativePath(path.join(parsed.dir, `${parsed.name}.diff.png`))
}

function createBaselineDownloader(
  diff: NormalizedScreenshotDiffOptions,
  downloadBaseline?: DownloadBaseline
): DownloadBaseline | undefined {
  if (!diff.baselineStorage) {
    return undefined
  }

  if (downloadBaseline) {
    return downloadBaseline
  }

  if (!diff.baselineStorage.storage) {
    throw new Error('baselineStorage.storage is required for remote baseline downloads')
  }

  const provider = createStorageProvider(diff.baselineStorage.storage)
  if (!provider.download) {
    throw new Error(`Storage provider ${diff.baselineStorage.storage.type} does not support downloads`)
  }

  return provider.download.bind(provider)
}

async function writeRemoteBaseline({
  diff,
  relativePath,
  outputDirectory,
  downloadBaseline,
}: {
  diff: NormalizedScreenshotDiffOptions
  relativePath: string
  outputDirectory: string
  downloadBaseline: DownloadBaseline
}): Promise<string | undefined> {
  if (!diff.baselineStorage) {
    return undefined
  }

  const remotePath = generatePathFromTemplate(diff.baselineStorage.pathTemplate, {
    filename: path.basename(relativePath),
    relativePath,
    prNumber: diff.baselineStorage.prNumber,
    runId: diff.baselineStorage.runId,
    commitSha: diff.baselineStorage.commitSha,
    branch: diff.baselineStorage.branch,
  })

  const baselineBuffer = await downloadBaseline(remotePath)
  if (!baselineBuffer) {
    return undefined
  }

  const baselinePath = path.join(outputDirectory, relativePath)
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(baselinePath, baselineBuffer)
  return baselinePath
}

/**
 * Select the local images that should be uploaded. With no diff options this is
 * a compatibility pass-through. With diff options it compares each screenshot
 * against a baseline image with the same relative path and skips low-signal
 * pixel diffs before upload.
 */
export async function selectScreenshotsForUpload(
  options: SelectScreenshotsOptions
): Promise<SelectedScreenshots> {
  const sortedScreenshots = [...options.screenshots].sort()

  if (!options.diff) {
    return {
      candidates: sortedScreenshots.map((screenshotPath) => ({
        sourcePath: screenshotPath,
        uploadPath: screenshotPath,
        name: path.basename(screenshotPath),
        relativePath: normalizeRelativePath(path.relative(options.directory, screenshotPath)),
        sourceRelativePath: normalizeRelativePath(path.relative(options.directory, screenshotPath)),
        kind: 'screenshot',
      })),
    }
  }

  const diff = validateDiffOptions(options.diff)
  const outputDirectory = diff.diffOutputDirectory || fs.mkdtempSync(path.join(os.tmpdir(), 'glimpse-diffs-'))
  const baselineStorage = diff.baselineStorage
  const baselineDownloadDirectory = baselineStorage
    ? baselineStorage.downloadDirectory || fs.mkdtempSync(path.join(os.tmpdir(), 'glimpse-baselines-'))
    : undefined
  const shouldCleanupOutputDirectory = !diff.diffOutputDirectory
  const shouldCleanupBaselineDownloadDirectory = Boolean(baselineStorage && !baselineStorage.downloadDirectory)
  fs.mkdirSync(outputDirectory, { recursive: true })
  if (baselineDownloadDirectory) {
    fs.mkdirSync(baselineDownloadDirectory, { recursive: true })
  }

  let stopCompareImages: (() => void) | undefined
  let compareImages = options.compareImages

  try {
    if (!compareImages) {
      const odiff = await createDefaultCompareImages()
      compareImages = odiff.compareImages
      stopCompareImages = odiff.stop
    }

    const odiffOptions: ODiffOptions & { timeout?: number } = {
      diffOverlay: true,
      ...diff.odiffOptions,
      noFailOnFsErrors: true,
    }
    const candidates: ScreenshotUploadCandidate[] = []
    const downloadBaseline = createBaselineDownloader(diff, options.downloadBaseline)

    for (const screenshotPath of sortedScreenshots) {
      const relativePath = normalizeRelativePath(path.relative(options.directory, screenshotPath))
      const baselinePath = diff.baselineDirectory
        ? path.join(diff.baselineDirectory, relativePath)
        : diff.baselineStorage
          ? await writeRemoteBaseline({
              diff,
              relativePath,
              outputDirectory: baselineDownloadDirectory!,
              downloadBaseline: downloadBaseline!,
            })
          : undefined

      if (!baselinePath || !fs.existsSync(baselinePath)) {
        candidates.push(
          createChangedScreenshotCandidate(screenshotPath, relativePath, baselinePath || '', screenshotPath, relativePath, 'screenshot', {
            reason: 'missing-baseline',
          })
        )
        continue
      }

      const diffOutputPath = getDiffOutputPath(outputDirectory, relativePath)
      fs.mkdirSync(path.dirname(diffOutputPath), { recursive: true })

      const result = await compareImages(baselinePath, screenshotPath, diffOutputPath, odiffOptions)

      if (result.match) {
        continue
      }

      if (result.reason === 'pixel-diff') {
        const percentage = result.diffPercentage ?? 0
        if (percentage < diff.minDiffPercentage) {
          continue
        }

        const useDiffImage = diff.uploadMode === 'diffs' && fs.existsSync(diffOutputPath)
        candidates.push(
          createChangedScreenshotCandidate(
            screenshotPath,
            relativePath,
            baselinePath,
            useDiffImage ? diffOutputPath : screenshotPath,
            useDiffImage ? getDiffRelativePath(relativePath) : relativePath,
            useDiffImage ? 'diff' : 'screenshot',
            {
              reason: 'pixel-diff',
              percentage,
              count: result.diffCount,
            }
          )
        )
        continue
      }

      candidates.push(
        createChangedScreenshotCandidate(screenshotPath, relativePath, baselinePath, screenshotPath, relativePath, 'screenshot', {
          reason: result.reason === 'layout-diff' ? 'layout-diff' : 'missing-baseline',
        })
      )
    }

    return {
      candidates: candidates.sort(compareByLargestDiff),
      cleanup: shouldCleanupOutputDirectory
        ? () => fs.rmSync(outputDirectory, { recursive: true, force: true })
        : undefined,
    }
  } catch (error) {
    if (shouldCleanupOutputDirectory) {
      fs.rmSync(outputDirectory, { recursive: true, force: true })
    }
    if (shouldCleanupBaselineDownloadDirectory) {
      fs.rmSync(baselineDownloadDirectory!, { recursive: true, force: true })
    }
    throw error
  } finally {
    if (shouldCleanupBaselineDownloadDirectory) {
      fs.rmSync(baselineDownloadDirectory!, { recursive: true, force: true })
    }
    stopCompareImages?.()
  }
}
