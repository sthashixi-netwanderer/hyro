import { logger } from '../logger'
import { logger } from '../logger'
import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import type { Artist } from '../../shared/types'

const CACHE_DIR = join(app.getPath('userData'), 'artist-cache')

interface ArtistCacheEntry {
  artistId: string
  name: string
  data: Artist
  songIds: string[]
  albumIds: string[]
  lastUpdated: string
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

function getCachePath(artistId: string): string {
  return join(CACHE_DIR, `${artistId}.json`)
}

function readCache(artistId: string): ArtistCacheEntry | null {
  try {
    const path = getCachePath(artistId)
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as ArtistCacheEntry
  } catch {
    return null
  }
}

function writeCache(entry: ArtistCacheEntry): void {
  ensureCacheDir()
  const path = getCachePath(entry.artistId)
  writeFileSync(path, JSON.stringify(entry, null, 2), 'utf-8')
}

/**
 * Get cached artist data without triggering a refresh.
 * Returns null if no cache exists for this artist.
 */
export function getCachedArtist(artistId: string): Artist | null {
  const entry = readCache(artistId)
  return entry?.data ?? null
}

/**
 * Save artist data to the disk cache.
 */
export function saveArtistCache(artistId: string, data: Artist): void {
  const entry: ArtistCacheEntry = {
    artistId,
    name: data.name,
    data,
    songIds: (data.songs || []).map(s => s.videoId),
    albumIds: [...(data.albums || []).map(a => a.albumId), ...(data.singles || []).map(s => s.albumId)],
    lastUpdated: new Date().toISOString()
  }
  writeCache(entry)
  logger.log(`[artist-cache] Saved cache for "${data.name}" (${artistId}): ${(data.songs || []).length} songs, ${(data.albums || []).length} albums, ${(data.singles || []).length} singles`)
}

/**
 * Compare cached song/album IDs with fresh data to detect changes.
 */
function detectChanges(
  cachedEntry: ArtistCacheEntry | null,
  freshData: Artist
): { newSongs: number; removedSongs: number; newAlbums: number; removedAlbums: number } {
  if (!cachedEntry) return { newSongs: 0, removedSongs: 0, newAlbums: 0, removedAlbums: 0 }

  const oldSongIds = new Set(cachedEntry.songIds)
  const newSongIds = new Set((freshData.songs || []).map(s => s.videoId))
  const oldAlbumIds = new Set(cachedEntry.albumIds)
  const newAlbumIds = new Set([
    ...(freshData.albums || []).map(a => a.albumId),
    ...(freshData.singles || []).map(s => s.albumId)
  ])

  const newSongs = [...newSongIds].filter(id => !oldSongIds.has(id)).length
  const removedSongs = [...oldSongIds].filter(id => !newSongIds.has(id)).length
  const newAlbums = [...newAlbumIds].filter(id => !oldAlbumIds.has(id)).length
  const removedAlbums = [...oldAlbumIds].filter(id => !newAlbumIds.has(id)).length

  return { newSongs, removedSongs, newAlbums, removedAlbums }
}

/**
 * Refresh artist data in the background.
 * Fetches fresh data, compares with cache, logs changes, and updates cache.
 * This is fire-and-forget — callers don't await it.
 */
export async function refreshArtistInBackground(
  artistId: string,
  fetchArtist: (artistId: string) => Promise<Artist>
): Promise<void> {
  try {
    const cachedEntry = readCache(artistId)
    const freshData = await fetchArtist(artistId)

    const changes = detectChanges(cachedEntry, freshData)
    const hasChanges = changes.newSongs > 0 || changes.removedSongs > 0 ||
      changes.newAlbums > 0 || changes.removedAlbums > 0

    if (hasChanges && cachedEntry) {
      logger.log(
        `[artist-cache] Changes detected for "${freshData.name}" (${artistId}): ` +
        `+${changes.newSongs}/-${changes.removedSongs} songs, ` +
        `+${changes.newAlbums}/-${changes.removedAlbums} albums`
      )
    }

    saveArtistCache(artistId, freshData)
  } catch (err) {
    logger.warn(`[artist-cache] Background refresh failed for ${artistId}:`, err)
  }
}

/**
 * Get all cached artist IDs (for diagnostics or cleanup).
 */
export function getAllCachedArtistIds(): string[] {
  ensureCacheDir()
  try {
    return readdirSync(CACHE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

/**
 * Clear cache for a specific artist or all artists.
 */
export function clearArtistCache(artistId?: string): void {
  if (artistId) {
    const path = getCachePath(artistId)
    if (existsSync(path)) unlinkSync(path)
  } else if (existsSync(CACHE_DIR)) {
    const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      unlinkSync(join(CACHE_DIR, file))
    }
  }
}

/**
 * Register IPC handlers for the artist cache.
 * `fetchArtist` is the function that actually fetches artist data from YouTube.
 */
export function registerArtistCacheIPC(
  fetchArtist: (artistId: string) => Promise<Artist>
): void {
  ensureCacheDir()

  /**
   * Get cached artist data instantly.
   * Returns cached data if available, null otherwise.
   * Triggers a background refresh regardless.
   */
  ipcMain.handle('artist-cache:get', async (_event, artistId: string) => {
    const cached = getCachedArtist(artistId)

    // Fire background refresh (don't await)
    refreshArtistInBackground(artistId, fetchArtist).catch(() => {})

    return cached
  })

  /**
   * Force a fresh fetch, update cache, and return the fresh data.
   * Used for pull-to-refresh or when the UI needs guaranteed fresh data.
   */
  ipcMain.handle('artist-cache:getSynced', async (_event, artistId: string) => {
    try {
      const freshData = await fetchArtist(artistId)
      saveArtistCache(artistId, freshData)
      return freshData
    } catch (err) {
      logger.warn(`[artist-cache] Sync failed for ${artistId}:`, err)
      // Return cached data as fallback
      return getCachedArtist(artistId)
    }
  })

  /**
   * Clear cache for a specific artist or all artists.
   */
  ipcMain.handle('artist-cache:clear', async (_event, artistId?: string) => {
    clearArtistCache(artistId)
    return { success: true }
  })
}
