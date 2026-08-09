import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { UserPlaylist, Track } from '../../shared/types'

const CONFIG_DIR = app.getPath('userData')
const PLAYLISTS_FILE = join(CONFIG_DIR, 'playlists.json')

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function readPlaylists(): UserPlaylist[] {
  try {
    ensureConfigDir()
    if (!existsSync(PLAYLISTS_FILE)) return []
    const data = readFileSync(PLAYLISTS_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePlaylists(playlists: UserPlaylist[]): void {
  ensureConfigDir()
  writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2))
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function createPlaylist(name: string, description: string = ''): UserPlaylist {
  const playlists = readPlaylists()
  const playlist: UserPlaylist = {
    id: generateId(),
    name,
    description,
    tracks: [],
    thumbnailUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  playlists.unshift(playlist)
  writePlaylists(playlists)
  return playlist
}

function renamePlaylist(id: string, name: string): UserPlaylist | null {
  const playlists = readPlaylists()
  const playlist = playlists.find(p => p.id === id)
  if (!playlist) return null
  playlist.name = name
  playlist.updatedAt = new Date().toISOString()
  writePlaylists(playlists)
  return playlist
}

function deletePlaylist(id: string): boolean {
  const playlists = readPlaylists()
  const filtered = playlists.filter(p => p.id !== id)
  if (filtered.length === playlists.length) return false
  writePlaylists(filtered)
  return true
}

function addToPlaylist(playlistId: string, track: Track): { playlist: UserPlaylist | null; added: boolean } {
  const playlists = readPlaylists()
  const playlist = playlists.find(p => p.id === playlistId)
  if (!playlist) return { playlist: null, added: false }
  if (playlist.tracks.some(t => t.videoId === track.videoId)) {
    return { playlist, added: false }
  }
  playlist.tracks.push(track)
  playlist.thumbnailUrl = playlist.thumbnailUrl || track.thumbnails?.[0]?.url || null
  playlist.updatedAt = new Date().toISOString()
  writePlaylists(playlists)
  return { playlist, added: true }
}

function addTracksToPlaylist(playlistId: string, tracks: Track[]): { playlist: UserPlaylist | null; addedCount: number } {
  const playlists = readPlaylists()
  const playlist = playlists.find(p => p.id === playlistId)
  if (!playlist) return { playlist: null, addedCount: 0 }
  const existingIds = new Set(playlist.tracks.map(t => t.videoId))
  let addedCount = 0
  for (const track of tracks) {
    if (!existingIds.has(track.videoId)) {
      playlist.tracks.push(track)
      existingIds.add(track.videoId)
      addedCount++
    }
  }
  if (addedCount > 0) {
    playlist.thumbnailUrl = playlist.thumbnailUrl || playlist.tracks[0]?.thumbnails?.[0]?.url || null
    playlist.updatedAt = new Date().toISOString()
    writePlaylists(playlists)
  }
  return { playlist, addedCount }
}

function removeFromPlaylist(playlistId: string, videoId: string): UserPlaylist | null {
  const playlists = readPlaylists()
  const playlist = playlists.find(p => p.id === playlistId)
  if (!playlist) return null
  playlist.tracks = playlist.tracks.filter(t => t.videoId !== videoId)
  if (playlist.tracks.length === 0) {
    playlist.thumbnailUrl = null
  }
  playlist.updatedAt = new Date().toISOString()
  writePlaylists(playlists)
  return playlist
}

function reorderPlaylist(playlistId: string, fromIndex: number, toIndex: number): UserPlaylist | null {
  const playlists = readPlaylists()
  const playlist = playlists.find(p => p.id === playlistId)
  if (!playlist) return null
  if (fromIndex < 0 || fromIndex >= playlist.tracks.length) return playlist
  const [moved] = playlist.tracks.splice(fromIndex, 1)
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex
  playlist.tracks.splice(Math.max(0, insertAt), 0, moved)
  playlist.updatedAt = new Date().toISOString()
  writePlaylists(playlists)
  return playlist
}

function trackInPlaylist(playlistId: string, videoId: string): boolean {
  const playlists = readPlaylists()
  const playlist = playlists.find(p => p.id === playlistId)
  if (!playlist) return false
  return playlist.tracks.some(t => t.videoId === videoId)
}

function playlistsContainingTrack(videoId: string): string[] {
  const playlists = readPlaylists()
  return playlists.filter(p => p.tracks.some(t => t.videoId === videoId)).map(p => p.id)
}

export function registerPlaylistsIPC(): void {
  ensureConfigDir()

  ipcMain.handle('playlists:get', async () => {
    return readPlaylists()
  })

  ipcMain.handle('playlists:getById', async (_event, id: string) => {
    const playlists = readPlaylists()
    return playlists.find(p => p.id === id) || null
  })

  ipcMain.handle('playlists:create', async (_event, name: string, description?: string) => {
    return createPlaylist(name, description)
  })

  ipcMain.handle('playlists:rename', async (_event, id: string, name: string) => {
    return renamePlaylist(id, name)
  })

  ipcMain.handle('playlists:delete', async (_event, id: string) => {
    return deletePlaylist(id)
  })

  ipcMain.handle('playlists:addTrack', async (_event, playlistId: string, track: Track) => {
    return addToPlaylist(playlistId, track)
  })

  ipcMain.handle('playlists:addTracks', async (_event, playlistId: string, tracks: Track[]) => {
    return addTracksToPlaylist(playlistId, tracks)
  })

  ipcMain.handle('playlists:removeTrack', async (_event, playlistId: string, videoId: string) => {
    return removeFromPlaylist(playlistId, videoId)
  })

  ipcMain.handle('playlists:reorder', async (_event, playlistId: string, fromIndex: number, toIndex: number) => {
    return reorderPlaylist(playlistId, fromIndex, toIndex)
  })

  ipcMain.handle('playlists:containsTrack', async (_event, playlistId: string, videoId: string) => {
    return trackInPlaylist(playlistId, videoId)
  })

  ipcMain.handle('playlists:containingTrack', async (_event, videoId: string) => {
    return playlistsContainingTrack(videoId)
  })
}
