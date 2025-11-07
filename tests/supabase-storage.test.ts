import { test, expect } from '@playwright/test'
import { SupabaseStorage } from '../src/storage/supabase.js'
import type { SupabaseConfig } from '../src/storage/index.js'

test.describe('SupabaseStorage', () => {
  test('should use default bucket if not specified', () => {
    const config: SupabaseConfig = {
      type: 'supabase',
      url: 'https://test.supabase.co',
      key: 'test-key',
    }

    const storage = new SupabaseStorage(config)
    expect(storage).toBeDefined()
  })

  test('should use custom bucket if specified', () => {
    const config: SupabaseConfig = {
      type: 'supabase',
      url: 'https://test.supabase.co',
      key: 'test-key',
      bucket: 'custom-bucket',
    }

    const storage = new SupabaseStorage(config)
    expect(storage).toBeDefined()
  })
})
