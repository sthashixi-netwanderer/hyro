import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const CONFIG_DIR = app.getPath('userData')
const HISTORY_FILE = join(CONFIG_DIR, 'play-history.json')

interface HistoryEntry {
  videoId: string
  name: string
  artist: { artistId: string | null; name: string }
  album: { albumId: string; name: string } | null
  duration: number | null
  thumbnails: Array<{ url: string; width: number; height: number }>
  type: 'SONG' | 'VIDEO'
  filePath?: string | null
  thumbnailPath?: string | null
  playedAt: string
}

const MAX_HISTORY = 500

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function readHistory(): HistoryEntry[] {
  try {
    ensureConfigDir()
    if (!existsSync(HISTORY_FILE)) return []
    const data = readFileSync(HISTORY_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  ensureConfigDir()
  writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2))
}

function addToHistory(track: any): HistoryEntry[] {
  const entries = readHistory()

  // Remove existing entry for this track (move to top)
  const filtered = entries.filter(e => e.videoId !== track.videoId)

  // Add new entry at the top
  const entry: HistoryEntry = {
    videoId: track.videoId,
    name: track.name,
    artist: { artistId: track.artist?.artistId || null, name: track.artist?.name || 'Unknown Artist' },
    album: track.album ? { albumId: track.album.albumId || '', name: track.album.name } : null,
    duration: track.duration || null,
    thumbnails: track.thumbnails || [],
    type: track.type || 'SONG',
    filePath: track.filePath || null,
    thumbnailPath: track.thumbnailPath || null,
    playedAt: new Date().toISOString()
  }

  filtered.unshift(entry)

  // Cap history size
  const trimmed = filtered.slice(0, MAX_HISTORY)
  writeHistory(trimmed)
  return trimmed
}

function removeFromHistory(videoIds: string[]): HistoryEntry[] {
  const entries = readHistory()
  const filtered = entries.filter(e => !videoIds.includes(e.videoId))
  writeHistory(filtered)
  return filtered
}

function clearHistory(): void {
  writeHistory([])
}

export function registerHistoryIPC(): void {
  ensureConfigDir()

  ipcMain.handle('history:get', async () => {
    return readHistory()
  })

  ipcMain.handle('history:add', async (_event, track: any) => {
    const entries = addToHistory(track)
    return entries
  })

  ipcMain.handle('history:remove', async (_event, videoIds: string[]) => {
    const entries = removeFromHistory(videoIds)
    return entries
  })

  ipcMain.handle('history:clear', async () => {
    clearHistory()
    return { success: true }
  })
}
