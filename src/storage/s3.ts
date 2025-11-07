import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import { StorageProvider, S3Config } from './index.js'

export class S3Storage implements StorageProvider {
  private client: S3Client
  private bucket: string
  private publicRead: boolean
  private initialized = false

  constructor(private config: S3Config) {
    const clientConfig: any = {
      region: config.region,
    }

    // Use explicit credentials if provided, otherwise use default credential chain
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      }
    }

    // Support for S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint
      clientConfig.forcePathStyle = true
    }

    this.client = new S3Client(clientConfig)
    this.bucket = config.bucket
    this.publicRead = config.publicRead !== false // Default to true
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Verify bucket exists
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      console.log(`Using S3 bucket: ${this.bucket}`)
    } catch (error: any) {
      if (error.name === 'NotFound') {
        throw new Error(
          `S3 bucket "${this.bucket}" does not exist. Please create it first.`
        )
      }
      throw new Error(`Failed to access S3 bucket: ${error.message}`)
    }

    this.initialized = true
  }

  async upload(filePath: string, remotePath: string): Promise<string> {
    await this.initialize()

    const fileBuffer = fs.readFileSync(filePath)
    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2)

    console.log(`Uploading ${remotePath} (${fileSizeMB}MB) to S3...`)

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: remotePath,
      Body: fileBuffer,
      ContentType: 'image/png',
      ACL: this.publicRead ? 'public-read' : undefined,
    })

    await this.client.send(command)

    // Construct public URL
    let publicUrl: string
    if (this.config.endpoint) {
      // For S3-compatible services with custom endpoints
      const endpoint = this.config.endpoint.replace(/\/$/, '')
      publicUrl = `${endpoint}/${this.bucket}/${remotePath}`
    } else {
      // Standard AWS S3 URL
      publicUrl = `https://${this.bucket}.s3.${this.config.region}.amazonaws.com/${remotePath}`
    }

    console.log(`✓ Uploaded: ${publicUrl}`)
    return publicUrl
  }
}
