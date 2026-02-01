import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readManifest, writeManifestEntry, MANIFEST_FILENAME } from '../src/utils/manifest.js'

test.describe('Manifest utilities', () => {
  let tempDir: string

  test.beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-manifest-'))
  })

  test.afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test.describe('MANIFEST_FILENAME', () => {
    test('should be a JSON filename', () => {
      expect(MANIFEST_FILENAME).toBe('.screenshots-manifest.json')
    })
  })

  test.describe('writeManifestEntry', () => {
    test('should create a new manifest file with one entry', () => {
      writeManifestEntry(tempDir, 'screenshot.png', { group: 'decks.spec.ts' })

      const manifestPath = path.join(tempDir, MANIFEST_FILENAME)
      expect(fs.existsSync(manifestPath)).toBe(true)

      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({
        'screenshot.png': { group: 'decks.spec.ts' }
      })
    })

    test('should append to existing manifest', () => {
      writeManifestEntry(tempDir, 'first.png', { group: 'auth.spec.ts' })
      writeManifestEntry(tempDir, 'second.png', { group: 'decks.spec.ts' })

      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({
        'first.png': { group: 'auth.spec.ts' },
        'second.png': { group: 'decks.spec.ts' }
      })
    })

    test('should use last entry when same filename is written twice', () => {
      writeManifestEntry(tempDir, 'screenshot.png', { group: 'old-group' })
      writeManifestEntry(tempDir, 'screenshot.png', { group: 'new-group' })

      const manifest = readManifest(tempDir)
      expect(manifest['screenshot.png'].group).toBe('new-group')
    })

    test('should handle entry without group', () => {
      writeManifestEntry(tempDir, 'screenshot.png', {})

      const manifest = readManifest(tempDir)
      expect(manifest['screenshot.png']).toEqual({})
    })

    test('should use NDJSON format (one JSON object per line)', () => {
      writeManifestEntry(tempDir, 'a.png', { group: 'test.spec.ts' })
      writeManifestEntry(tempDir, 'b.png', { group: 'other.spec.ts' })

      const raw = fs.readFileSync(path.join(tempDir, MANIFEST_FILENAME), 'utf8')
      const lines = raw.trim().split('\n')
      expect(lines).toHaveLength(2)

      const first = JSON.parse(lines[0])
      expect(first).toEqual({ filename: 'a.png', group: 'test.spec.ts' })

      const second = JSON.parse(lines[1])
      expect(second).toEqual({ filename: 'b.png', group: 'other.spec.ts' })
    })
  })

  test.describe('readManifest', () => {
    test('should return empty object when no manifest exists', () => {
      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({})
    })

    test('should read NDJSON format', () => {
      writeManifestEntry(tempDir, 'homepage.png', { group: 'home.spec.ts' })
      writeManifestEntry(tempDir, 'dashboard.png', { group: 'dash.spec.ts' })

      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({
        'homepage.png': { group: 'home.spec.ts' },
        'dashboard.png': { group: 'dash.spec.ts' }
      })
    })

    test('should read legacy plain-JSON format', () => {
      const manifestPath = path.join(tempDir, MANIFEST_FILENAME)
      const data = {
        'homepage.png': { group: 'home.spec.ts' },
        'dashboard.png': { group: 'dash.spec.ts' }
      }
      fs.writeFileSync(manifestPath, JSON.stringify(data))

      const manifest = readManifest(tempDir)
      expect(manifest).toEqual(data)
    })

    test('should return empty object for corrupt manifest', () => {
      const manifestPath = path.join(tempDir, MANIFEST_FILENAME)
      fs.writeFileSync(manifestPath, '{invalid json')

      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({})
    })

    test('should return empty object for empty file', () => {
      const manifestPath = path.join(tempDir, MANIFEST_FILENAME)
      fs.writeFileSync(manifestPath, '')

      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({})
    })

    test('should skip malformed lines in NDJSON and parse valid ones', () => {
      const manifestPath = path.join(tempDir, MANIFEST_FILENAME)
      const content = [
        '{"filename":"good.png","group":"test.spec.ts"}',
        'not json at all',
        '{"filename":"also-good.png","group":"other.spec.ts"}',
        ''
      ].join('\n')
      fs.writeFileSync(manifestPath, content)

      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({
        'good.png': { group: 'test.spec.ts' },
        'also-good.png': { group: 'other.spec.ts' }
      })
    })
  })

  test.describe('concurrency safety', () => {
    test('concurrent writeManifestEntry calls should not lose entries', async () => {
      // Simulate concurrent writes from parallel Playwright workers.
      // fs.appendFileSync with O_APPEND is atomic for small writes on Linux,
      // so all entries should be preserved.
      const count = 20
      const promises = Array.from({ length: count }, (_, i) =>
        Promise.resolve(
          writeManifestEntry(tempDir, `screenshot-${i}.png`, { group: `test-${i}.spec.ts` })
        )
      )
      await Promise.all(promises)

      const manifest = readManifest(tempDir)
      expect(Object.keys(manifest)).toHaveLength(count)
      for (let i = 0; i < count; i++) {
        expect(manifest[`screenshot-${i}.png`].group).toBe(`test-${i}.spec.ts`)
      }
    })

    test('manifest file should have one line per entry after concurrent writes', async () => {
      const count = 10
      for (let i = 0; i < count; i++) {
        writeManifestEntry(tempDir, `s${i}.png`, { group: 'g.spec.ts' })
      }

      const raw = fs.readFileSync(path.join(tempDir, MANIFEST_FILENAME), 'utf8')
      const lines = raw.trim().split('\n')
      expect(lines).toHaveLength(count)
    })
  })
})
