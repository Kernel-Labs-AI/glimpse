import fs from 'fs'
import path from 'path'

const REPLAY_VIDEO_EXTENSIONS = new Set(['.webm', '.mp4', '.mov', '.m4v'])

/**
 * Recursively find Playwright replay video files in a directory.
 */
export function findReplayVideos(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory ${dir} does not exist`)
  }

  const fileList: string[] = []
  const files = fs.readdirSync(dir, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(dir, file.name)
    if (file.isDirectory()) {
      fileList.push(...findReplayVideos(filePath))
    } else if (REPLAY_VIDEO_EXTENSIONS.has(path.extname(file.name).toLowerCase())) {
      fileList.push(filePath)
    }
  }

  return fileList
}
