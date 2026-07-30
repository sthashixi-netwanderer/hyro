import { logger } from '../logger'
import { ipcMain, app } from 'electron'
import { execFile, type ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs'
import { platform } from 'os'
import { getYtDlpCookieBrowser } from './settings'
import { recordDataUsage } from './data-usage'
import { getYtDlpBinaryPath } from './ytdlp-path'

const CACHE_DIR = join(app.getPath('userData'), 'stream-cache')

// Track active pre-cache processes by videoId for cancellation
const activeProcesses = new Map<string, ChildProcess>()
let preCacheRequestVersion = 0

// Persistent cookie state — once cookies fail with v11 decryption error,
// skip cookies for all subsequent tracks in this session.
// On Linux, Chromium v11 cookie encryption always fails in Electron's sandbox,
// so skip cookies entirely from the start.
let cookiesDisabled = platform() === 'linux'

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
    logger.error('Failed to clean up stale cache files:', err)
  }
}

/**
 * Run yt-dlp with the given args, resolving on success or rejecting on failure.
 * Cleans up the active process entry when done.
 */
function runYtDlp(
  videoId: string,
  args: string[],
  timeoutMs: number
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const proc = execFile(getYtDlpBinaryPath(), args, { timeout: timeoutMs }, (err, _stdout, stderr) => {
      activeProcesses.delete(videoId)
      if (err) {
        if ((err as any).killed || err.message.includes('killed')) {
          resolve({ ok: false, stderr: '' }) // cancelled
        } else {
          resolve({ ok: false, stderr: stderr || err.message })
        }
      } else {
        resolve({ ok: true, stderr: '' })
      }
    })
    activeProcesses.set(videoId, proc)
  })
}

/**
 * Build the base yt-dlp args for stream-cache pre-caching.
 */
function buildCacheArgs(videoId: string, playerClient: string, withCookies: boolean): string[] {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const outputPath = join(CACHE_DIR, `${videoId}.%(ext)s`)

  const args = [
    '-f', 'bestaudio',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '64K',
    '--extractor-args', `youtube:player_client=${playerClient}`,
    '--no-playlist',
    '--no-write-thumbnail',
    '--no-write-info-json',
    '--no-write-description',
    '--no-write-comments',
    '--newline',
    '-o', outputPath,
    url
  ]

  if (withCookies) {
    const ytDlpCookie = getYtDlpCookieBrowser()
    if (ytDlpCookie) {
      args.push('--cookies-from-browser', ytDlpCookie)
    }
  }

  return args
}

/**
 * Player client fallback chain for pre-caching.
 * Ordered from most reliable to least; each step also drops cookies if the
 * previous step hit a cookie decryption error.
 *
 * - android_vr: No PO Token or cookies needed, returns direct audio URLs.
 * - web_creator,mweb: Legacy fallback that needs cookies for PO Token derivation.
 * - web: Last resort (needs cookies for audio formats)
 */
const PLAYER_CLIENTS = ['android_vr', 'web_creator,mweb', 'web']

/**
 * Pre-cache a single track to the stream cache directory.
 * Uses lightweight yt-dlp args (no metadata, no thumbnails, low quality) for speed.
 * Tries multiple player client / cookie combinations on failure.
 */
async function preCacheTrack(videoId: string): Promise<void> {
  // Skip if already cached
  if (getCachedPath(videoId)) {
    logger.log(`[stream-cache] ${videoId} already cached, skipping`)
    return
  }

  // Skip if already being downloaded
  if (activeProcesses.has(videoId)) {
    logger.log(`[stream-cache] ${videoId} already being downloaded, skipping`)
    return
  }

  const hasCookies = !!getYtDlpCookieBrowser()
  logger.log(`[stream-cache] Pre-caching ${videoId}...`)

  for (let i = 0; i < PLAYER_CLIENTS.length; i++) {
    const client = PLAYER_CLIENTS[i]
    const useCookies = hasCookies && !cookiesDisabled
    const args = buildCacheArgs(videoId, client, useCookies)
    logger.log(`[stream-cache] Trying player_client=${client} cookies=${useCookies}`)

    const result = await runYtDlp(videoId, args, 120000)

    if (result.ok) {
      logger.log(`[stream-cache] Pre-cached ${videoId}`)
      try {
        const cachedFile = getCachedPath(videoId)
        if (cachedFile && existsSync(cachedFile)) {
          const stat = statSync(cachedFile)
          recordDataUsage(stat.size, 'cache')
        }
      } catch { /* Ignore stat failure */ }
      return
    }

    // If cancelled, stop immediately
    if (!result.stderr) return

    const isCookieError = hasCookies && result.stderr.includes('cannot decrypt v11 cookies')
    if (isCookieError) {
      cookiesDisabled = true
      logger.warn(`[stream-cache] Cookie decryption failed for ${videoId} with client ${client}, retrying without cookies...`)
      // Retry this same client without cookies
      const noCookieArgs = buildCacheArgs(videoId, client, false)
      const retry = await runYtDlp(videoId, noCookieArgs, 120000)
      if (retry.ok) {
        logger.log(`[stream-cache] Pre-cached ${videoId} (no cookies, client=${client})`)
        try {
          const cachedFile = getCachedPath(videoId)
          if (cachedFile && existsSync(cachedFile)) {
            const stat = statSync(cachedFile)
            recordDataUsage(stat.size, 'cache')
          }
        } catch { /* Ignore stat failure */ }
        return
      }
      logger.warn(`[stream-cache] Failed for ${videoId} with client=${client} (no cookies): ${retry.stderr.slice(0, 200)}`)
    } else {
      logger.warn(`[stream-cache] Failed for ${videoId} with client=${client}: ${result.stderr.slice(0, 200)}`)
    }
  }

  logger.error(`[stream-cache] Pre-cache FAILED for ${videoId} (all client combos exhausted)`)
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
    logger.log(`[stream-cache] All ${videoIds.length} track(s) already cached`)
    return
  }

  logger.log(`[stream-cache] Pre-cache batch: ${toCache.length} track(s) [${toCache.join(', ')}]`)

  // Pre-cache sequentially to avoid overwhelming the network.
  // The request version lets a newer queue window stop this stale worker
  // without mistaking a normally completed download for a cancellation.
  for (let i = 0; i < toCache.length; i++) {
    if (requestVersion !== preCacheRequestVersion) {
      logger.log(`[stream-cache] Pre-cache batch superseded at track ${i + 1}/${toCache.length}, stopping`)
      return
    }
    logger.log(`[stream-cache] Track ${i + 1}/${toCache.length}`)
    await preCacheTrack(toCache[i])
  }

  logger.log(`[stream-cache] Pre-cache batch complete`)
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
  cookiesDisabled = false
  killAllProcesses()

  try {
    if (existsSync(CACHE_DIR)) {
      rmSync(CACHE_DIR, { recursive: true, force: true })
    }
  } catch (err) {
    logger.error('Failed to clear stream cache:', err)
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
    preCacheTracks(videoIds).catch(logger.error)
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
