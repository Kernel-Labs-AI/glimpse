import { S3Client, PutObjectCommand, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import { Readable } from 'stream'
import { StorageProvider, S3Config } from './index.js'

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (stream instanceof Readable) {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  if (stream?.transformToByteArray) {
    return Buffer.from(await stream.transformToByteArray())
  }

  throw new Error('Unsupported S3 response body type')
}

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

  async upload(filePath: string, remotePath: string, options: { contentType?: string } = {}): Promise<string> {
    await this.initialize()

    const fileSize = fs.statSync(filePath).size
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2)

    console.log(`Uploading ${remotePath} (${fileSizeMB}MB) to S3...`)

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: remotePath,
      Body: fs.createReadStream(filePath),
      ContentLength: fileSize,
      ContentType: options.contentType || 'image/png',
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

  async download(remotePath: string): Promise<Buffer | undefined> {
    await this.initialize()

    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: remotePath,
      }))

      if (!result.Body) {
        return undefined
      }

      return streamToBuffer(result.Body)
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
        return undefined
      }
      throw error
    }
  }
}
