import fs from 'fs'
import { get, put } from '@vercel/blob'
import { StorageProvider, VercelBlobConfig } from './index.js'

async function readableStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Buffer[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
  }

  return Buffer.concat(chunks)
}

function isNotFoundError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()
  return error?.name === 'BlobNotFoundError' || message.includes('not found')
}

export class VercelBlobStorage implements StorageProvider {
  private token?: string

  constructor(private config: VercelBlobConfig) {
    this.token = config.token || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN
  }

  async upload(filePath: string, remotePath: string, options: { contentType?: string } = {}): Promise<string> {
    if (!this.token) {
      throw new Error('VERCEL_BLOB_READ_WRITE_TOKEN or BLOB_READ_WRITE_TOKEN is required for Vercel Blob uploads')
    }

    const fileSize = fs.statSync(filePath).size
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2)

    console.log(`Uploading ${remotePath} (${fileSizeMB}MB) to Vercel Blob...`)

    const blob = await put(remotePath, fs.createReadStream(filePath), {
      access: 'public',
      contentType: options.contentType || 'image/png',
      token: this.token,
      addRandomSuffix: false,
      allowOverwrite: true,
      multipart: fileSize >= 5 * 1024 * 1024,
    })

    console.log(`✓ Uploaded: ${blob.url}`)
    return blob.url
  }

  async download(remotePath: string): Promise<Buffer | undefined> {
    if (!this.token) {
      throw new Error('VERCEL_BLOB_READ_WRITE_TOKEN or BLOB_READ_WRITE_TOKEN is required for Vercel Blob downloads')
    }

    try {
      const result = await get(remotePath, {
        access: 'public',
        token: this.token,
      })

      if (!result || result.statusCode === 304 || !result.stream) {
        return undefined
      }

      return readableStreamToBuffer(result.stream)
    } catch (error: any) {
      if (isNotFoundError(error)) {
        return undefined
      }
      throw error
    }
  }
}
