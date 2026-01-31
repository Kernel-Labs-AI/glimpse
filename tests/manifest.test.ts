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

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
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

    test('should overwrite existing entry for same filename', () => {
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

    test('should recover from corrupt manifest file', () => {
      const manifestPath = path.join(tempDir, MANIFEST_FILENAME)
      fs.writeFileSync(manifestPath, 'not valid json{{{')

      writeManifestEntry(tempDir, 'screenshot.png', { group: 'test.spec.ts' })

      const manifest = readManifest(tempDir)
      expect(manifest['screenshot.png'].group).toBe('test.spec.ts')
    })
  })

  test.describe('readManifest', () => {
    test('should return empty object when no manifest exists', () => {
      const manifest = readManifest(tempDir)
      expect(manifest).toEqual({})
    })

    test('should read a valid manifest file', () => {
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
  })
})
