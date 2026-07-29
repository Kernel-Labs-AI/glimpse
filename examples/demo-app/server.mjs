import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join(appDirectory, 'index.html')

export async function startDemoServer({ port = 0 } = {}) {
  const html = await fs.readFile(indexPath)
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname
    if (pathname !== '/' && pathname !== '/index.html') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(html)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Demo server did not expose a TCP address')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const port = Number(process.env.PORT || 4173)
  const demo = await startDemoServer({ port })
  console.log(`Glimpse demo app: ${demo.url}?demo=1`)
}
