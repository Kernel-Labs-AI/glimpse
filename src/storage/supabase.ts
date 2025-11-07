import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import { StorageProvider, SupabaseConfig } from './index.js'

export class SupabaseStorage implements StorageProvider {
  private client: SupabaseClient
  private bucket: string
  private initialized = false

  constructor(private config: SupabaseConfig) {
    this.client = createClient(config.url, config.key)
    this.bucket = config.bucket || 'screenshots'
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    // Check if bucket exists, create if it doesn't
    const { data: buckets } = await this.client.storage.listBuckets()
    const bucketExists = buckets?.some(b => b.name === this.bucket)

    if (!bucketExists) {
      console.log(`Creating Supabase bucket: ${this.bucket}`)
      const { error } = await this.client.storage.createBucket(this.bucket, {
        public: true,
        fileSizeLimit: 10485760 // 10MB
      })

      if (error) {
        throw new Error(`Failed to create Supabase bucket: ${error.message}`)
      }
    }

    this.initialized = true
  }

  async upload(filePath: string, remotePath: string): Promise<string> {
    await this.initialize()

    const fileBuffer = fs.readFileSync(filePath)
    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2)

    console.log(`Uploading ${remotePath} (${fileSizeMB}MB) to Supabase...`)

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(remotePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      })

    if (error) {
      throw new Error(`Failed to upload ${remotePath}: ${error.message}`)
    }

    // Get public URL
    const { data: urlData } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(remotePath)

    if (!urlData?.publicUrl) {
      throw new Error(`Failed to get public URL for ${remotePath}`)
    }

    console.log(`✓ Uploaded: ${urlData.publicUrl}`)
    return urlData.publicUrl
  }
}
