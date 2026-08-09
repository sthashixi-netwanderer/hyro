import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { Track } from '../../shared/types'

const CONFIG_DIR = app.getPath('userData')
const LIKED_SONGS_FILE = join(CONFIG_DIR, 'liked-songs.json')

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function readLikedSongs(): Track[] {
  try {
    ensureConfigDir()
    if (!existsSync(LIKED_SONGS_FILE)) return []
    const data = readFileSync(LIKED_SONGS_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    if (parsed && Array.isArray(parsed.tracks)) return parsed.tracks
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLikedSongs(tracks: Track[]): void {
  ensureConfigDir()
  writeFileSync(LIKED_SONGS_FILE, JSON.stringify({ tracks }, null, 2))
}

function isTrackLiked(videoId: string): boolean {
  const tracks = readLikedSongs()
  return tracks.some(t => t.videoId === videoId)
}

function toggleLikedSong(track: Track): { tracks: Track[]; added: boolean } {
  const tracks = readLikedSongs()
  const index = tracks.findIndex(t => t.videoId === track.videoId)
  if (index >= 0) {
    tracks.splice(index, 1)
    writeLikedSongs(tracks)
    return { tracks, added: false }
  }
  tracks.unshift(track)
  writeLikedSongs(tracks)
  return { tracks, added: true }
}

function addLikedSongs(newTracks: Track[]): Track[] {
  const tracks = readLikedSongs()
  const existingIds = new Set(tracks.map(t => t.videoId))
  for (const track of newTracks) {
    if (!existingIds.has(track.videoId)) {
      tracks.push(track)
      existingIds.add(track.videoId)
    }
  }
  writeLikedSongs(tracks)
  return tracks
}

function removeLikedSong(videoId: string): Track[] {
  const tracks = readLikedSongs()
  const filtered = tracks.filter(t => t.videoId !== videoId)
  writeLikedSongs(filtered)
  return filtered
}

function removeLikedSongs(videoIds: string[]): Track[] {
  const ids = new Set(videoIds)
  const tracks = readLikedSongs()
  const filtered = tracks.filter(t => !ids.has(t.videoId))
  writeLikedSongs(filtered)
  return filtered
}

function reorderLikedSongs(fromIndex: number, toIndex: number): Track[] {
  const tracks = readLikedSongs()
  if (fromIndex < 0 || fromIndex >= tracks.length) return tracks
  const [moved] = tracks.splice(fromIndex, 1)
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex
  tracks.splice(Math.max(0, insertAt), 0, moved)
  writeLikedSongs(tracks)
  return tracks
}

export function registerLikedSongsIPC(): void {
  ensureConfigDir()

  ipcMain.handle('liked-songs:get', async () => {
    return readLikedSongs()
  })

  ipcMain.handle('liked-songs:toggle', async (_event, track: Track) => {
    return toggleLikedSong(track)
  })

  ipcMain.handle('liked-songs:check', async (_event, videoId: string) => {
    return isTrackLiked(videoId)
  })

  ipcMain.handle('liked-songs:addTracks', async (_event, tracks: Track[]) => {
    return addLikedSongs(tracks)
  })

  ipcMain.handle('liked-songs:remove', async (_event, videoId: string) => {
    return removeLikedSong(videoId)
  })

  ipcMain.handle('liked-songs:removeTracks', async (_event, videoIds: string[]) => {
    return removeLikedSongs(videoIds)
  })

  ipcMain.handle('liked-songs:reorder', async (_event, fromIndex: number, toIndex: number) => {
    return reorderLikedSongs(fromIndex, toIndex)
  })
}
