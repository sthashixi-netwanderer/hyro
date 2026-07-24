import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

export const IMAGE_CACHE_DIR = join(app.getPath('userData'), 'image-cache')

function ensureCacheDir(): void {
  if (!existsSync(IMAGE_CACHE_DIR)) {
    mkdirSync(IMAGE_CACHE_DIR, { recursive: true })
  }
}

export function hashUrl(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex')
  let ext = '.jpg'
  if (url.includes('.png')) ext = '.png'
  else if (url.includes('.webp')) ext = '.webp'
  return `${hash}${ext}`
}

function getFallbackUrls(url: string): string[] {
  const fallbacks: string[] = []
  if (url.includes('=w1200-h1200')) {
    fallbacks.push(url.replace('=w1200-h1200', '=w540-h540'))
    fallbacks.push(url.replace('=w1200-h1200', '=s500'))
    fallbacks.push(url.split('=')[0])
  } else if (url.includes('ytimg.com/vi/')) {
    fallbacks.push(url.replace('/hqdefault.jpg', '/mqdefault.jpg'))
    fallbacks.push(url.replace('/hqdefault.jpg', '/default.jpg'))
  }
  return fallbacks
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  const urlsToTry = [url, ...getFallbackUrls(url)]
  for (const targetUrl of urlsToTry) {
    try {
      const response = await fetch(targetUrl, { signal: AbortSignal.timeout(8000) })
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.length > 500) {
          ensureCacheDir()
          writeFileSync(destPath, buffer)
          return true
        }
      }
    } catch {
      // Try next fallback URL
    }
  }
  return false
}

export function registerImageCacheIPC(): void {
  ipcMain.handle('image-cache:get', async (_event, url: string) => {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return url

    const filename = hashUrl(url)
    const filePath = join(IMAGE_CACHE_DIR, filename)

    if (existsSync(filePath)) {
      return `media://local${filePath}`
    }

    const success = await downloadImage(url, filePath)
    if (success) {
      return `media://local${filePath}`
    }

    return url
  })

  ipcMain.handle('image-cache:preCache', async (_event, urls: string[]) => {
    if (!Array.isArray(urls) || urls.length === 0) return { count: 0 }

    ensureCacheDir()
    const validUrls = urls.filter((u) => typeof u === 'string' && u.startsWith('http'))
    const CONCURRENCY = 6

    for (let i = 0; i < validUrls.length; i += CONCURRENCY) {
      const batch = validUrls.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        batch.map(async (url) => {
          const filename = hashUrl(url)
          const filePath = join(IMAGE_CACHE_DIR, filename)
          if (!existsSync(filePath)) {
            await downloadImage(url, filePath)
          }
        })
      )
    }

    return { count: validUrls.length }
  })
}
