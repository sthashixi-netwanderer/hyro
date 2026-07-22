import { ipcMain, app } from 'electron'
import { execFile, type ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, readdirSync } from 'fs'
import { getCookieBrowser } from './settings'

const CACHE_DIR = join(app.getPath('userData'), 'stream-cache')

// Track active pre-cache processes by videoId for cancellation
const activeProcesses = new Map<string, ChildProcess>()
let preCacheRequestVersion = 0

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

function getCachedPath(videoId: string): string | null {
  const mp3Path = join(CACHE_DIR, `${videoId}.mp3`)
  if (existsSync(mp3Path)) return mp3Path
  return null
}

function killProcess(videoId: string): void {
  const proc = activeProcesses.get(videoId)
  if (proc && !proc.killed) {
    proc.kill('SIGTERM')
  }
  activeProcesses.delete(videoId)
}

function killAllProcesses(): void {
  for (const [videoId, proc] of activeProcesses) {
    if (!proc.killed) {
      proc.kill('SIGTERM')
    }
    activeProcesses.delete(videoId)
  }
}

/**
 * Clean up stale files left by killed or crashed yt-dlp processes.
 * Removes .part files (interrupted downloads) and orphaned .webm files
 * (download completed but conversion to .mp3 failed or was interrupted).
 */
function cleanupStaleFiles(): void {
  if (!existsSync(CACHE_DIR)) return
  try {
    const files = readdirSync(CACHE_DIR)
    for (const file of files) {
      if (file.endsWith('.part')) {
        rmSync(join(CACHE_DIR, file), { force: true })
      } else if (file.endsWith('.webm')) {
        // Orphaned .webm — clean up if the .mp3 conversion already succeeded,
        // or if no .mp3 exists (failed conversion from a killed process).
        const videoId = file.replace('.webm', '')
        rmSync(join(CACHE_DIR, file), { force: true })
      }
    }
  } catch (err) {
    console.error('Failed to clean up stale cache files:', err)
  }
}

/**
 * Pre-cache a single track to the stream cache directory.
 * Uses lightweight yt-dlp args (no metadata, no thumbnails, low quality) for speed.
 */
function preCacheTrack(videoId: string): Promise<void> {
  // Skip if already cached
  if (getCachedPath(videoId)) {
    console.log(`[stream-cache] ${videoId} already cached, skipping`)
    return Promise.resolve()
  }

  // Skip if already being downloaded
  if (activeProcesses.has(videoId)) {
    console.log(`[stream-cache] ${videoId} already being downloaded, skipping`)
    return Promise.resolve()
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`
  const outputPath = join(CACHE_DIR, `${videoId}.%(ext)s`)

  const args = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '64K',
    '--extractor-args', 'youtube:player_client=android_vr,ios,android,web',
    '--no-playlist',
    '--no-write-thumbnail',
    '--no-write-info-json',
    '--no-write-description',
    '--no-write-comments',
    '--newline',
    '-o', outputPath,
    url
  ]

  const cookieBrowser = getCookieBrowser()
  if (cookieBrowser) {
    args.push('--cookies-from-browser', cookieBrowser)
  }

  const cmdStr = `yt-dlp ${args.map(a => `"${a}"`).join(' ')}`
  console.log(`[stream-cache] Pre-caching ${videoId}...`)
  console.log(`[stream-cache] Command: ${cmdStr}`)

  return new Promise((resolve, reject) => {
    const proc = execFile('yt-dlp', args, { timeout: 120000 }, (err) => {
      activeProcesses.delete(videoId)
      if (err) {
        if ((err as any).killed || err.message.includes('killed')) {
          // Killed = cancelled, not an error
          console.log(`[stream-cache] ${videoId} pre-cache cancelled (superseded)`)
          resolve()
        } else {
          console.error(`[stream-cache] Pre-cache FAILED for ${videoId}: ${err.message}`)
          resolve() // Don't reject - pre-cache failure is non-fatal
        }
      } else {
        console.log(`[stream-cache] Pre-cached ${videoId} ✓`)
        resolve()
      }
    })

    activeProcesses.set(videoId, proc)
  })
}

/**
 * Pre-cache multiple tracks sequentially.
 * Cancels any existing pre-cache processes first.
 */
async function preCacheTracks(videoIds: string[]): Promise<void> {
  const requestVersion = ++preCacheRequestVersion

  // Replace downloads for an outdated queue with the current next-three window.
  killAllProcesses()

  // Clean up .part files and orphaned .webm files from previous interrupted runs.
  cleanupStaleFiles()

  // Filter out already-cached tracks
  const toCache = videoIds.filter(id => !getCachedPath(id))

  if (toCache.length === 0) {
    console.log(`[stream-cache] All ${videoIds.length} track(s) already cached`)
    return
  }

  console.log(`[stream-cache] Pre-cache batch: ${toCache.length} track(s) [${toCache.join(', ')}]`)

  // Pre-cache sequentially to avoid overwhelming the network.
  // The request version lets a newer queue window stop this stale worker
  // without mistaking a normally completed download for a cancellation.
  for (let i = 0; i < toCache.length; i++) {
    if (requestVersion !== preCacheRequestVersion) {
      console.log(`[stream-cache] Pre-cache batch superseded at track ${i + 1}/${toCache.length}, stopping`)
      return
    }
    console.log(`[stream-cache] Track ${i + 1}/${toCache.length}`)
    await preCacheTrack(toCache[i])
  }

  console.log(`[stream-cache] Pre-cache batch complete`)
}

/**
 * Cancel pre-caching for specific videoIds.
 */
function cancelPreCache(videoIds: string[]): void {
  if (videoIds.length === 0) {
    preCacheRequestVersion++
    killAllProcesses()
    return
  }

  for (const videoId of videoIds) {
    killProcess(videoId)
  }
}

/**
 * Clear the entire stream cache directory and kill all active processes.
 * Called on app launch (crash recovery) and app quit (cleanup).
 */
function clearCache(): void {
  preCacheRequestVersion++
  killAllProcesses()

  try {
    if (existsSync(CACHE_DIR)) {
      rmSync(CACHE_DIR, { recursive: true, force: true })
    }
  } catch (err) {
    console.error('Failed to clear stream cache:', err)
  }
}

/**
 * Get the cache directory path (for diagnostics).
 */
function getCacheDir(): string {
  return CACHE_DIR
}

export function registerStreamCacheIPC(): void {
  ensureCacheDir()

  ipcMain.handle('stream-cache:getPath', async (_event, videoId: string) => {
    return getCachedPath(videoId)
  })

  ipcMain.handle('stream-cache:preCache', async (_event, videoIds: string[]) => {
    // Fire and forget - don't await in the IPC handler
    preCacheTracks(videoIds).catch(console.error)
    return { success: true }
  })

  ipcMain.handle('stream-cache:cancel', async (_event, videoIds: string[]) => {
    cancelPreCache(videoIds)
    return { success: true }
  })

  ipcMain.handle('stream-cache:clear', async () => {
    clearCache()
    return { success: true }
  })
}

export { clearCache as clearStreamCache, getCachedPath, getCacheDir }
