import fs from 'fs'
import path from 'path'

/**
 * Recursively find all PNG files in a directory
 */
export function findScreenshots(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory ${dir} does not exist`)
  }

  const fileList: string[] = []
  const files = fs.readdirSync(dir, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(dir, file.name)
    if (file.isDirectory()) {
      // Recursively find screenshots in subdirectories
      fileList.push(...findScreenshots(filePath))
    } else if (file.name.endsWith('.png')) {
      fileList.push(filePath)
    }
  }

  return fileList
}
