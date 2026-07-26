import { logger } from '../logger'
import { BrowserWindow, ipcMain, app } from 'electron'
import { execFile, type ChildProcess } from 'child_process'
import { join, relative, dirname } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from 'fs'
import { addToRegistry } from './library'
import { getCookieBrowser, loadSettings } from './settings'
import { getYtDlpBinaryPath } from './ytdlp-path'

const CONFIG_DIR = app.getPath('userData')
const QUEUE_FILE = join(CONFIG_DIR, 'download-queue.json')

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function saveQueueFile(items: any[]): void {
  ensureConfigDir()
  writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2))
}

function loadQueueFile(): any[] {
  try {
    if (!existsSync(QUEUE_FILE)) return []
    const data = readFileSync(QUEUE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const BASE_DIR = join(homedir(), 'Downloads', 'Hyro')

function getSidecarJsonPath(mp3Path: string): string {
  const rel = relative(BASE_DIR, mp3Path)
  const jsonRel = rel.replace(/\.mp3$/i, '.json')
  return join(CONFIG_DIR, 'metadata', jsonRel)
}

function getLyricsPath(mp3Path: string, ext: '.lrc' | '.txt'): string {
  return mp3Path.replace('.mp3', ext)
}

async function saveLyricsForTrack(
  mp3Path: string, trackName: string, artistName: string,
  albumName: string | null, duration: number | null
): Promise<void> {
  try {
    const { Song } = await import('musixmlrc/dist/song.js')
    const { Musixmatch } = await import('musixmlrc/dist/musixmatch.js')
    const song = new Song(artistName, trackName, albumName || '', '')
    if (duration && duration > 0) song.duration = duration * 1000
    const mxm = new Musixmatch()
    const body = await mxm.findLyrics(song)
    if (body) {
      song.updateInfo(body)
      if (Musixmatch.getSynced(song, body) && song.subtitles && song.subtitles.length > 0) {
        const lines = song.subtitles
          .filter((l: { text: string }) => l.text.trim() !== '')
          .map((l: { minutes: number; seconds: number; hundredths: number; text: string }) => {
            const mm = String(l.minutes).padStart(2, '0')
            const ss = String(l.seconds).padStart(2, '0')
            const cc = String(l.hundredths).padStart(2, '0')
            return `[${mm}:${ss}.${cc}]${l.text}`
          })
        if (lines.length > 0) {
          const lrc = `[ti:${trackName}]\n[ar:${artistName}]\n${lines.join('\n')}\n`
          writeFileSync(getLyricsPath(mp3Path, '.lrc'), lrc, 'utf-8')
          return
        }
      }
      if (Musixmatch.getUnsynced(song, body) && song.lyrics && song.lyrics.length > 0) {
        const plain = song.lyrics.map((l: { text: string }) => l.text).filter((t: string) => t.trim() !== '')
        if (plain.length > 0) {
          writeFileSync(getLyricsPath(mp3Path, '.txt'), plain.join('\n'), 'utf-8')
          return
        }
      }
    }
  } catch { /* Musixmatch failed */ }

  try {
    const params = new URLSearchParams({ track_name: trackName, artist_name: artistName })
    if (albumName && albumName !== '-') params.set('album_name', albumName)
    const res = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: { 'User-Agent': 'Hyro Music v1.0.0 (https://github.com/hyro-music)' }
    })
    if (res.ok) {
      const results = await res.json() as Array<{ instrumental: boolean; duration: number; syncedLyrics: string | null; plainLyrics: string | null }>
      let bestSynced: string | null = null
      let bestPlain: string | null = null
      let bestScore = -1
      for (const r of results) {
        if (r.instrumental) continue
        let score = 0
        if (r.syncedLyrics) score += 100
        if (duration && r.duration) {
          const diff = Math.abs(r.duration - duration)
          if (diff <= 3) score += 50
          else if (diff <= 10) score += 35
          else if (diff <= 30) score += 15
        }
        if (score > bestScore) { bestScore = score; bestSynced = r.syncedLyrics; bestPlain = r.plainLyrics }
      }
      if (bestSynced) writeFileSync(getLyricsPath(mp3Path, '.lrc'), bestSynced, 'utf-8')
      else if (bestPlain) writeFileSync(getLyricsPath(mp3Path, '.txt'), bestPlain, 'utf-8')
    }
  } catch { /* LRCLIB failed */ }
}

function sanitize(name: string): string {
  return name.replace(/[\/\\:*?"<>|()]/g, '').replace(/\s+/g, ' ').trim()
}

function deleteFileSafe(filePath: string): void {
  try { if (existsSync(filePath)) unlinkSync(filePath) } catch { /* ignore */ }
}

function findActualMp3(dir: string, baseName: string): string | null {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
  const mp3File = files.find(f => f.startsWith(baseName) && f.endsWith('.mp3'))
  return mp3File ? join(dir, mp3File) : null
}

function deletePartialFiles(dir: string, baseName: string): void {
  if (!existsSync(dir)) return
  const files = readdirSync(dir)
  for (const file of files) {
    if (file.startsWith(baseName) && !file.endsWith('.mp3') && !file.endsWith('.json')) {
      deleteFileSafe(join(dir, file))
    }
  }
}

function writeSidecarJson(
  basePath: string, track: any,
  extra: { container?: string; containerType?: 'artist' | 'album' | 'playlist' | 'single'; keepThumbnail?: boolean }
): void {
  const mp3Path = basePath + '.mp3'
  const jpgPath = basePath + '.jpg'
  const sidecar = {
    videoId: track.videoId,
    name: track.name,
    artist: { artistId: track.artist?.artistId || null, name: track.artist?.name || 'Unknown Artist' },
    album: track.album ? { albumId: track.album.albumId || '', name: track.album.name } : null,
    duration: track.duration || null,
    thumbnails: track.thumbnails || [],
    type: track.type || 'SONG',
    filePath: mp3Path,
    thumbnailPath: (extra.keepThumbnail !== false && existsSync(jpgPath)) ? jpgPath : null,
    downloadedAt: new Date().toISOString(),
    container: extra.container || track.artist?.name || 'Unknown Artist',
    containerType: extra.containerType || 'single' as const
  }
  const jsonPath = getSidecarJsonPath(mp3Path)
  const jsonDir = dirname(jsonPath)
  if (!existsSync(jsonDir)) mkdirSync(jsonDir, { recursive: true })
  writeFileSync(jsonPath, JSON.stringify(sidecar, null, 2))
  addToRegistry(sidecar)
  if (extra.keepThumbnail === false) deleteFileSafe(jpgPath)
}

// ── Download Queue Manager ──────────────────────────────────────────────────

interface DownloadTask {
  id: string
  type: 'track' | 'album-track' | 'playlist-track'
  track: any
  basePath: string
  dir: string
  container?: string
  containerType?: 'artist' | 'album' | 'playlist' | 'single'
  keepThumbnail?: boolean
  trackIndex?: number
  totalTracks?: number
}

class DownloadQueueManager {
  private queue: DownloadTask[] = []
  private activeCount = 0
  private maxConcurrent = 1
  private activeProcesses = new Map<string, ChildProcess>()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  refreshConcurrency() {
    const settings = loadSettings()
    if (typeof settings.maxConcurrentDownloads === 'number') {
      this.maxConcurrent = settings.maxConcurrentDownloads
    }
  }

  enqueue(task: DownloadTask) {
    this.refreshConcurrency()
    this.queue.push(task)
    this.processNext()
  }

  cancel(taskId: string): boolean {
    // Remove from queue if queued
    const qIdx = this.queue.findIndex(t => t.id === taskId)
    if (qIdx !== -1) {
      this.queue.splice(qIdx, 1)
      return true
    }
    // Kill active process
    const proc = this.activeProcesses.get(taskId)
    if (proc && !proc.killed) {
      proc.kill('SIGTERM')
      this.activeProcesses.delete(taskId)
      return true
    }
    return false
  }

  cancelAll() {
    for (const [id, proc] of this.activeProcesses) {
      if (!proc.killed) proc.kill('SIGTERM')
    }
    this.activeProcesses.clear()
    this.queue = []
    this.activeCount = 0
  }

  private processNext() {
    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const task = this.queue.shift()!
      this.activeCount++
      this.runTask(task)
    }
  }

  private sendProgress(data: any) {
    this.mainWindow?.webContents.send('download:progress', data)
  }

  private async runTask(task: DownloadTask) {
    const url = `https://www.youtube.com/watch?v=${task.track.videoId}`
    const outputPath = task.basePath + '.%(ext)s'
    const args = [
      '-x', '--audio-format', 'mp3',
      '--add-metadata', '--embed-thumbnail', '--write-thumbnail',
      '--convert-thumbnails', 'jpg',
      '--newline', '-o', outputPath, url
    ]
    const cookieBrowser = getCookieBrowser()
    if (cookieBrowser) args.push('--cookies-from-browser', cookieBrowser)

    return new Promise<void>((resolve) => {
      const proc = execFile(getYtDlpBinaryPath(), args, { timeout: 300000 }, (err) => {
        this.activeProcesses.delete(task.id)
        if (err) {
          if ((err as any).killed || err.message.includes('killed')) {
            this.sendProgress({
              id: task.id, type: task.type === 'track' ? 'track' : task.type.replace('-track', ''),
              trackName: task.track.name, progress: 0, status: 'cancelled',
              trackIndex: task.trackIndex, totalTracks: task.totalTracks
            })
          } else {
            logger.error('yt-dlp download error:', err.message)
            this.sendProgress({
              id: task.id, type: task.type === 'track' ? 'track' : task.type.replace('-track', ''),
              trackName: task.track.name, progress: 0, status: 'error', error: err.message,
              trackIndex: task.trackIndex, totalTracks: task.totalTracks
            })
          }
          this.activeCount--
          this.processNext()
          resolve()
          return
        }

        // Success — write sidecar, save lyrics, send done
        const actualMp3 = findActualMp3(task.dir, task.basePath.split('/').pop() || '')
        const finalBasePath = actualMp3 ? actualMp3.replace('.mp3', '') : task.basePath
        writeSidecarJson(finalBasePath, task.track, {
          container: task.container,
          containerType: task.containerType || 'single',
          keepThumbnail: task.keepThumbnail
        })
        saveLyricsForTrack(
          actualMp3 || task.basePath + '.mp3',
          task.track.name,
          task.track.artist?.name || 'Unknown Artist',
          task.track.album?.name || null,
          task.track.duration || null
        )

        const progressType = task.type === 'track' ? 'track' : task.type.replace('-track', '')
        this.sendProgress({
          id: task.id, type: progressType,
          trackName: task.track.name, progress: 100, status: 'done',
          trackIndex: task.trackIndex, totalTracks: task.totalTracks
        })

        this.activeCount--
        this.processNext()
        resolve()
      })

      this.activeProcesses.set(task.id, proc)

      proc.stdout?.on('data', (data: string) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          const match = line.match(/(\d+\.?\d*)%/)
          if (match) {
            const progressType = task.type === 'track' ? 'track' : task.type.replace('-track', '')
            this.sendProgress({
              id: task.id, type: progressType,
              trackName: task.track.name,
              progress: parseFloat(match[1]),
              status: 'downloading',
              trackIndex: task.trackIndex, totalTracks: task.totalTracks
            })
          }
        }
      })
    })
  }
}

export const downloadQueue = new DownloadQueueManager()

export function registerDownloadQueueIPC(mainWindow: BrowserWindow | null): void {
  downloadQueue.setMainWindow(mainWindow)

  // Queue persistence
  ipcMain.handle('download-queue:save', async (_event, items: any[]) => {
    saveQueueFile(items)
    return { success: true }
  })

  ipcMain.handle('download-queue:load', async () => {
    return loadQueueFile()
  })

  // Single track download
  const handleTrackDownload = (event: any, track: any) => {
    const artistDir = sanitize(track.artist?.name || 'Unknown Artist')
    const trackName = sanitize(track.name)
    const dir = join(BASE_DIR, artistDir)
    const basePath = join(dir, trackName)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    downloadQueue.enqueue({
      id: track.videoId,
      type: 'track',
      track,
      basePath,
      dir,
      container: track.artist?.name || 'Unknown Artist',
      containerType: 'single',
      keepThumbnail: false
    })
    return { success: true }
  }

  // Album download — enqueue each track individually
  const handleAlbumDownload = (event: any, album: any, tracks: any[]) => {
    const artistDir = sanitize(album.artist?.name || 'Unknown Artist')
    const albumDir = sanitize(album.name)
    const dir = join(BASE_DIR, artistDir, albumDir)
    const albumDownloadId = `album:${album.albumId}`
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      const trackNum = String(i + 1).padStart(2, '0')
      const trackName = sanitize(track.name)
      const basePath = join(dir, `${trackNum}. ${trackName}`)

      downloadQueue.enqueue({
        id: `${albumDownloadId}:${track.videoId}`,
        type: 'album-track',
        track: { ...track, artist: album.artist || track.artist, album: { albumId: album.albumId || '', name: album.name } },
        basePath,
        dir,
        container: `${artistDir} - ${albumDir}`,
        containerType: 'album',
        keepThumbnail: true,
        trackIndex: i,
        totalTracks: tracks.length
      })
    }
    return { success: true }
  }

  // Playlist download — enqueue each track individually
  const handlePlaylistDownload = (event: any, playlist: any, tracks: any[]) => {
    const playlistDir = sanitize(playlist.name)
    const dir = join(BASE_DIR, playlistDir)
    const playlistDownloadId = `playlist:${playlist.playlistId}`
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      const trackNum = String(i + 1).padStart(2, '0')
      const trackName = sanitize(track.name)
      const basePath = join(dir, `${trackNum}. ${trackName}`)

      downloadQueue.enqueue({
        id: `${playlistDownloadId}:${track.videoId}`,
        type: 'playlist-track',
        track,
        basePath,
        dir,
        container: playlistDir,
        containerType: 'playlist',
        keepThumbnail: true,
        trackIndex: i,
        totalTracks: tracks.length
      })
    }
    return { success: true }
  }

  return { handleTrackDownload, handleAlbumDownload, handlePlaylistDownload }
}
