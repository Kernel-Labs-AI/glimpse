import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { compare } from 'odiff-bin'
import { startDemoServer } from './server.mjs'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(appDirectory, '../..')
const imageDirectory = path.join(repositoryRoot, 'docs/images')
const demoDirectory = path.join(repositoryRoot, 'docs/demo')
const baselinePath = path.join(imageDirectory, 'visual-diff-baseline.png')
const currentPath = path.join(imageDirectory, 'visual-diff-current.png')
const diffPath = path.join(imageDirectory, 'visual-diff-output.png')
const videoPath = path.join(demoDirectory, 'glimpse-demo.mp4')
const gifPath = path.join(demoDirectory, 'glimpse-demo.gif')
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'glimpse-demo-'))

await fs.mkdir(imageDirectory, { recursive: true })
await fs.mkdir(demoDirectory, { recursive: true })

const server = await startDemoServer()
let browser

try {
  browser = await chromium.launch()

  const screenshotContext = await browser.newContext({
    viewport: { width: 1200, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const screenshotPage = await screenshotContext.newPage()

  for (const [variant, outputPath] of [
    ['baseline', baselinePath],
    ['current', currentPath],
  ]) {
    await screenshotPage.goto(`${server.url}?variant=${variant}&capture=1`)
    await screenshotPage.waitForFunction(() => window.__demoReady === true)
    await screenshotPage.screenshot({ path: outputPath })
  }
  await screenshotContext.close()

  const diffResult = await compare(baselinePath, currentPath, diffPath, {
    antialiasing: true,
    diffColor: '#ff2d55',
    diffOverlay: true,
    threshold: 0.1,
  })
  if (diffResult.match || diffResult.reason !== 'pixel-diff') {
    throw new Error(`Expected a pixel diff, received ${JSON.stringify(diffResult)}`)
  }

  const videoContext = await browser.newContext({
    viewport: { width: 1200, height: 720 },
    colorScheme: 'dark',
    recordVideo: {
      dir: temporaryDirectory,
      size: { width: 1200, height: 720 },
    },
  })
  const videoPage = await videoContext.newPage()
  await videoPage.goto(`${server.url}?demo=1`)
  await videoPage.waitForFunction(() => window.__demoReady === true)
  await videoPage.waitForTimeout(900)
  await videoPage.getByRole('button', { name: 'Show proposed change' }).click()
  await videoPage.waitForTimeout(1700)
  await videoPage.getByRole('button', { name: 'Highlight diff' }).click()
  await videoPage.waitForTimeout(1700)
  await videoPage.getByRole('button', { name: 'Baseline' }).click()
  await videoPage.waitForTimeout(900)

  const recordedVideo = videoPage.video()
  await videoContext.close()
  const recordedPath = await recordedVideo.path()

  const mp4 = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', recordedPath,
    '-an', '-c:v', 'libx264', '-crf', '25', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath,
  ], { stdio: 'inherit' })
  if (mp4.status !== 0) {
    throw new Error('ffmpeg could not create the README MP4')
  }

  const gif = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', recordedPath,
    '-filter_complex',
    '[0:v]fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', gifPath,
  ], { stdio: 'inherit' })
  if (gif.status !== 0) {
    throw new Error('ffmpeg could not create the inline README preview')
  }

  console.log(`Generated README assets (${diffResult.diffPercentage.toFixed(2)}% pixel diff)`)
} finally {
  await browser?.close()
  await server.close()
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
}
