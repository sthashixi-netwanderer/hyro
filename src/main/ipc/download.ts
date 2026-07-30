import { logger } from '../logger'
import { ipcMain, BrowserWindow, app } from 'electron'
import { execFile, type ChildProcess } from 'child_process'
import { join, relative, dirname } from 'path'
import { homedir, platform } from 'os'
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from 'fs'
import { addToRegistry } from './library'
import { getYtDlpCookieBrowser, loadSettings } from './settings'
import { getYtDlpBinaryPath } from './ytdlp-path'
import { bestThumbnailUrl } from '../../shared/utils'

const BASE_DIR = join(homedir(), 'Downloads', 'Hyro')
const CONFIG_DIR = app.getPath('userData')

function getSidecarJsonPath(mp3Path: string): string {
  const rel = relative(BASE_DIR, mp3Path)
  const jsonRel = rel.replace(/\.mp3$/i, '.json')
  return join(CONFIG_DIR, 'metadata', jsonRel)
}

// ── Offline lyrics helpers ──────────────────────────────────────────────────

function getLyricsPath(mp3Path: string, ext: '.lrc' | '.txt'): string {
  return mp3Path.replace('.mp3', ext)
}

/** Fetch and save lyrics alongside a downloaded MP3. Non-blocking — errors are silently ignored. */
async function saveLyricsForTrack(
  mp3Path: string,
  trackName: string,
  artistName: string,
  albumName: string | null,
  duration: number | null
): Promise<void> {
  try {
    // Try Musixmatch first
    const { Song } = await import('musixmlrc/dist/song.js')
    const { Musixmatch } = await import('musixmlrc/dist/musixmatch.js')

    const song = new Song(artistName, trackName, albumName || '', '')
    if (duration && duration > 0) song.duration = duration * 1000

    const mxm = new Musixmatch()
    const body = await mxm.findLyrics(song)

    if (body) {
      song.updateInfo(body)

      // Try synced lyrics → .lrc
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
          return // synced found, no need for plain
        }
      }

      // Try plain lyrics → .txt
      if (Musixmatch.getUnsynced(song, body) && song.lyrics && song.lyrics.length > 0) {
        const plain = song.lyrics.map((l: { text: string }) => l.text).filter((t: string) => t.trim() !== '')
        if (plain.length > 0) {
          writeFileSync(getLyricsPath(mp3Path, '.txt'), plain.join('\n'), 'utf-8')
          return
        }
      }
    }
  } catch {
    // Musixmatch failed, try LRCLIB
  }

  // Fallback: LRCLIB
  try {
    const params = new URLSearchParams({ track_name: trackName, artist_name: artistName })
    if (albumName && albumName !== '-') params.set('album_name', albumName)
    const res = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: { 'User-Agent': 'Hyro Music v1.0.0 (https://github.com/hyro-music)' }
    })
    if (res.ok) {
      const results = await res.json() as Array<{
        instrumental: boolean
        duration: number
        syncedLyrics: string | null
        plainLyrics: string | null
      }>
      // Find best match with synced lyrics
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
        if (score > bestScore) {
          bestScore = score
          bestSynced = r.syncedLyrics
          bestPlain = r.plainLyrics
        }
      }
      if (bestSynced) {
        writeFileSync(getLyricsPath(mp3Path, '.lrc'), bestSynced, 'utf-8')
      } else if (bestPlain) {
        writeFileSync(getLyricsPath(mp3Path, '.txt'), bestPlain, 'utf-8')
      }
    }
  } catch {
    // LRCLIB failed too — no lyrics saved
  }
}

/** Read local lyrics file for a track. Returns null if no file exists. */
export function readLocalLyrics(mp3Path: string): { plain: string[]; synced: { time: number; text: string }[]; provider: string } | null {
  const lrcPath = getLyricsPath(mp3Path, '.lrc')
  if (existsSync(lrcPath)) {
    const content = readFileSync(lrcPath, 'utf-8')
    const synced: { time: number; text: string }[] = []
    const plain: string[] = []
    for (const line of content.split('\n')) {
      const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/)
      if (match) {
        const fracStr = match[3]
        const frac = fracStr.length === 3 ? parseInt(fracStr) / 1000 : parseInt(fracStr) / 100
        const time = parseInt(match[1]) * 60 + parseInt(match[2]) + frac
        const text = match[4].trim()
        if (text) synced.push({ time, text })
      } else if (line.trim() && !line.startsWith('[')) {
        plain.push(line.trim())
      }
    }
    if (synced.length > 0) return { plain: [], synced, provider: 'Offline' }
    if (plain.length > 0) return { plain, synced: [], provider: 'Offline' }
  }

  const txtPath = getLyricsPath(mp3Path, '.txt')
  if (existsSync(txtPath)) {
    const content = readFileSync(txtPath, 'utf-8')
    const plain = content.split('\n').filter(l => l.trim() !== '')
    if (plain.length > 0) return { plain, synced: [], provider: 'Offline' }
  }

  return null
}

/**
 * Downloads the album/playlist cover art and saves it as cover.jpg in the container directory.
 * Returns the cover file path, or null if download failed.
 */
async function downloadContainerCover(dir: string, thumbnails: any[]): Promise<string | null> {
  const coverUrl = bestThumbnailUrl(thumbnails)
  if (!coverUrl) return null
  try {
    const response = await fetch(coverUrl)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const coverPath = join(dir, 'cover.jpg')
    writeFileSync(coverPath, buffer)
    return coverPath
  } catch {
    return null
  }
}

// Track active yt-dlp processes by download ID so we can cancel them
const activeProcesses = new Map<string, ChildProcess>()

// Persistent cookie state — once cookies fail with v11 decryption error,
// skip cookies for all subsequent downloads in this session.
// On Linux, Chromium v11 cookie encryption always fails in Electron's sandbox.
let cookiesDisabled = platform() === 'linux'

// Player client fallback chain for downloads (most reliable → least)
// android_vr: No PO Token or cookies needed, returns direct audio URLs.
// web_creator,mweb: Legacy fallback that needs cookies for PO Token derivation.
// web: Last resort, often returns no audio formats.
const DOWNLOAD_PLAYER_CLIENTS = ['android_vr', 'web_creator,mweb', 'web']

function sanitize(name: string): string {
  return name.replace(/[\/\\:*?"<>|()]/g, '').replace(/\s+/g, ' ').trim()
}

function deleteFileSafe(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch { /* ignore */ }
}

/**
 * Downloads a track with yt-dlp. Tries multiple player clients and
 * falls back to no-cookies when cookie decryption fails.
 */
function downloadTrackAudio(
  downloadId: string,
  videoId: string,
  basePath: string,
  onProgress: (progress: number) => void
): Promise<void> {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const outputPath = basePath + '.%(ext)s'
  const hasCookies = !!getYtDlpCookieBrowser()

  async function tryDownload(client: string, withCookies: boolean): Promise<void> {
    const args = [
      '-f', 'bestaudio',
      '-x',
      '--audio-format', 'mp3',
      '--add-metadata',
      '--embed-thumbnail',
      '--write-thumbnail',
      '--convert-thumbnails', 'jpg',
      '--extractor-args', `youtube:player_client=${client}`,
      '--newline',
      '-o', outputPath,
      url
    ]

    if (withCookies && !cookiesDisabled) {
      const ytDlpCookie = getYtDlpCookieBrowser()
      if (ytDlpCookie) {
        args.push('--cookies-from-browser', ytDlpCookie)
      }
    }

    return new Promise((resolve, reject) => {
      const proc = execFile(getYtDlpBinaryPath(), args, { timeout: 300000 }, (err, _stdout, stderr) => {
        activeProcesses.delete(downloadId)
        if (err) {
          if ((err as any).killed || err.message.includes('killed')) {
            reject(new Error('Cancelled'))
          } else {
            reject(new Error(stderr || err.message))
          }
        } else {
          resolve()
        }
      })

      activeProcesses.set(downloadId, proc)

      proc.stdout?.on('data', (data: string) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          const match = line.match(/(\d+\.?\d*)%/)
          if (match) {
            onProgress(parseFloat(match[1]))
          }
        }
      })
    })
  }

  return (async () => {
    for (let i = 0; i < DOWNLOAD_PLAYER_CLIENTS.length; i++) {
      const client = DOWNLOAD_PLAYER_CLIENTS[i]
      const useCookies = hasCookies && !cookiesDisabled

      try {
        await tryDownload(client, useCookies)
        return // success
      } catch (err: any) {
        if (err.message === 'Cancelled') throw err

        const isCookieError = hasCookies && err.message.includes('cannot decrypt v11 cookies')
        if (isCookieError) {
          cookiesDisabled = true
          logger.warn(`[download] Cookie decryption failed for ${videoId} with client ${client}, retrying without cookies...`)
          try {
            await tryDownload(client, false)
            return // success without cookies
          } catch (retryErr: any) {
            if (retryErr.message === 'Cancelled') throw retryErr
            logger.warn(`[download] Failed for ${videoId} with client=${client} (no cookies): ${retryErr.message?.slice(0, 200)}`)
          }
        } else {
          logger.warn(`[download] Failed for ${videoId} with client=${client}: ${err.message?.slice(0, 200)}`)
        }
      }
    }
    throw new Error('Download failed: all player client combinations exhausted')
  })()
}

function writeSidecarJson(
  basePath: string,
  track: any,
  extra: { container?: string; containerType?: 'artist' | 'album' | 'playlist' | 'single'; keepThumbnail?: boolean; containerCoverPath?: string | null }
): void {
  const mp3Path = basePath + '.mp3'
  const jpgPath = basePath + '.jpg'

  // Use container cover art if available (album/playlist), otherwise use track's own thumbnail
  const thumbnailPath = extra.containerCoverPath
    ? extra.containerCoverPath
    : (extra.keepThumbnail !== false && existsSync(jpgPath)) ? jpgPath : null

  const sidecar = {
    videoId: track.videoId,
    name: track.name,
    artist: { artistId: track.artist?.artistId || null, name: track.artist?.name || 'Unknown Artist' },
    album: track.album ? { albumId: track.album.albumId || '', name: track.album.name } : null,
    duration: track.duration || null,
    thumbnails: track.thumbnails || [],
    type: track.type || 'SONG',
    filePath: mp3Path,
    thumbnailPath,
    downloadedAt: new Date().toISOString(),
    container: extra.container || track.artist?.name || 'Unknown Artist',
    containerType: extra.containerType || 'single' as const
  }

  // Write sidecar JSON to config folder metadata directory
  const jsonPath = getSidecarJsonPath(mp3Path)
  const jsonDir = dirname(jsonPath)
  if (!existsSync(jsonDir)) {
    mkdirSync(jsonDir, { recursive: true })
  }
  writeFileSync(jsonPath, JSON.stringify(sidecar, null, 2))

  // Register to centralized registry in app config directory
  addToRegistry(sidecar)

  // Delete the thumbnail JPG after embedding (only needed temporarily for --embed-thumbnail)
  if (extra.keepThumbnail === false) {
    deleteFileSafe(jpgPath)
  }
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

export function registerDownloadIPC(mainWindow: BrowserWindow | null): void {
  // Cancel a running download
  ipcMain.handle('download:cancel', async (_event, downloadId: string) => {
    const proc = activeProcesses.get(downloadId)
    if (proc && !proc.killed) {
      proc.kill('SIGTERM')
      activeProcesses.delete(downloadId)
      return { success: true }
    }
    return { success: false, error: 'Process not found' }
  })

  ipcMain.handle('download:track', async (event, track: any) => {
    const artistDir = sanitize(track.artist?.name || 'Unknown Artist')
    const trackName = sanitize(track.name)
    const dir = join(BASE_DIR, artistDir)
    const basePath = join(dir, trackName)
    const downloadId = track.videoId

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    try {
      await downloadTrackAudio(downloadId, track.videoId, basePath, (progress) => {
        event.sender.send('download:progress', {
          id: downloadId,
          type: 'track',
          trackName: track.name,
          progress,
          status: 'downloading'
        })
      })

      const actualMp3 = findActualMp3(dir, trackName)
      const finalBasePath = actualMp3 ? actualMp3.replace('.mp3', '') : basePath

      // Do not keep thumbnail for single tracks
      writeSidecarJson(finalBasePath, track, {
        container: track.artist?.name || 'Unknown Artist',
        containerType: 'single',
        keepThumbnail: false
      })

      // Save lyrics for offline display (non-blocking)
      saveLyricsForTrack(
        (actualMp3 || basePath + '.mp3'),
        track.name,
        track.artist?.name || 'Unknown Artist',
        track.album?.name || null,
        track.duration || null
      )

      event.sender.send('download:progress', {
        id: downloadId,
        type: 'track',
        trackName: track.name,
        progress: 100,
        status: 'done'
      })
      return { success: true }
    } catch (err: any) {
      if (err.message === 'Cancelled') {
        deletePartialFiles(dir, trackName)
        event.sender.send('download:progress', {
          id: downloadId,
          type: 'track',
          trackName: track.name,
          progress: 0,
          status: 'cancelled'
        })
        return { success: false, error: 'Cancelled' }
      }
      event.sender.send('download:progress', {
        id: downloadId,
        type: 'track',
        trackName: track.name,
        progress: 0,
        status: 'error',
        error: err.message
      })
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('download:album', async (event, album: any, tracks: any[]) => {
    const artistDir = sanitize(album.artist?.name || 'Unknown Artist')
    const albumDir = sanitize(album.name)
    const dir = join(BASE_DIR, artistDir, albumDir)
    const albumDownloadId = `album:${album.albumId}`
    const settings = loadSettings()
    const maxConcurrent = typeof settings.maxConcurrentDownloads === 'number' ? settings.maxConcurrentDownloads : 1

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    // Download album cover art once for all tracks
    const containerCoverPath = await downloadContainerCover(dir, album.thumbnails || [])

    let cancelled = false
    const cancelHandler = (_event: any, downloadId: string) => {
      if (downloadId === albumDownloadId || downloadId.startsWith(albumDownloadId + ':')) {
        cancelled = true
      }
    }
    ipcMain.on('download:cancel', cancelHandler)

    try {
      // Process tracks in batches of maxConcurrent
      for (let batchStart = 0; batchStart < tracks.length && !cancelled; batchStart += maxConcurrent) {
        const batch = tracks.slice(batchStart, batchStart + maxConcurrent)
        const promises = batch.map((track, batchIdx) => {
          const i = batchStart + batchIdx
          const trackNum = String(i + 1).padStart(2, '0')
          const trackName = sanitize(track.name)
          const basePath = join(dir, `${trackNum}. ${trackName}`)
          const trackDownloadId = `${albumDownloadId}:${track.videoId}`

          return downloadTrackAudio(trackDownloadId, track.videoId, basePath, (progress) => {
            event.sender.send('download:progress', {
              id: trackDownloadId,
              type: 'album',
              progress,
              status: 'downloading',
              trackIndex: i,
              totalTracks: tracks.length,
              trackName: track.name
            })
          }).then(() => {
            if (cancelled) return
            const actualMp3 = findActualMp3(dir, `${trackNum}. ${trackName}`)
            const finalBasePath = actualMp3 ? actualMp3.replace('.mp3', '') : basePath
            writeSidecarJson(finalBasePath, {
              ...track,
              artist: album.artist || track.artist,
              album: { albumId: album.albumId || '', name: album.name }
            }, {
              container: `${artistDir} - ${albumDir}`,
              containerType: 'album',
              keepThumbnail: true,
              containerCoverPath
            })
            saveLyricsForTrack(
              (actualMp3 || basePath + '.mp3'),
              track.name,
              (album.artist || track.artist)?.name || 'Unknown Artist',
              album.name || null,
              track.duration || null
            )
            event.sender.send('download:progress', {
              id: trackDownloadId,
              type: 'album',
              trackName: track.name,
              progress: 100,
              status: 'done',
              trackIndex: i,
              totalTracks: tracks.length
            })
          }).catch((err: any) => {
            if (cancelled || err.message === 'Cancelled') {
              deletePartialFiles(dir, `${trackNum}. ${trackName}`)
              event.sender.send('download:progress', {
                id: trackDownloadId,
                type: 'album',
                progress: 0,
                status: 'cancelled',
                trackIndex: i,
                totalTracks: tracks.length
              })
            } else {
              event.sender.send('download:progress', {
                id: trackDownloadId,
                type: 'album',
                progress: 0,
                status: 'error',
                error: err.message,
                trackIndex: i,
                totalTracks: tracks.length
              })
            }
          })
        })
        await Promise.allSettled(promises)
      }
    } finally {
      ipcMain.removeListener('download:cancel', cancelHandler)
    }

    if (cancelled) {
      // Cancel remaining tracks that weren't started
      for (let j = 0; j < tracks.length; j++) {
        const nextTrack = tracks[j]
        const nextDownloadId = `${albumDownloadId}:${nextTrack.videoId}`
        event.sender.send('download:progress', {
          id: nextDownloadId,
          type: 'album',
          progress: 0,
          status: 'cancelled',
          trackIndex: j,
          totalTracks: tracks.length
        })
      }
      return { success: false, error: 'Cancelled' }
    }

    event.sender.send('download:progress', {
      id: albumDownloadId,
      type: 'album',
      trackName: album.name,
      progress: 100,
      status: 'done'
    })
    return { success: true }
  })

  ipcMain.handle('download:playlist', async (event, playlist: any, tracks: any[]) => {
    const playlistDir = sanitize(playlist.name)
    const dir = join(BASE_DIR, playlistDir)
    const playlistDownloadId = `playlist:${playlist.playlistId}`
    const settings = loadSettings()
    const maxConcurrent = typeof settings.maxConcurrentDownloads === 'number' ? settings.maxConcurrentDownloads : 1

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    // Download playlist cover art once for all tracks
    const containerCoverPath = await downloadContainerCover(dir, playlist.thumbnails || [])

    let cancelled = false
    const cancelHandler = (_event: any, downloadId: string) => {
      if (downloadId === playlistDownloadId || downloadId.startsWith(playlistDownloadId + ':')) {
        cancelled = true
      }
    }
    ipcMain.on('download:cancel', cancelHandler)

    try {
      for (let batchStart = 0; batchStart < tracks.length && !cancelled; batchStart += maxConcurrent) {
        const batch = tracks.slice(batchStart, batchStart + maxConcurrent)
        const promises = batch.map((track, batchIdx) => {
          const i = batchStart + batchIdx
          const trackNum = String(i + 1).padStart(2, '0')
          const trackName = sanitize(track.name)
          const basePath = join(dir, `${trackNum}. ${trackName}`)
          const trackDownloadId = `${playlistDownloadId}:${track.videoId}`

          return downloadTrackAudio(trackDownloadId, track.videoId, basePath, (progress) => {
            event.sender.send('download:progress', {
              id: trackDownloadId,
              type: 'playlist',
              progress,
              status: 'downloading',
              trackIndex: i,
              totalTracks: tracks.length,
              trackName: track.name
            })
          }).then(() => {
            if (cancelled) return
            const actualMp3 = findActualMp3(dir, `${trackNum}. ${trackName}`)
            const finalBasePath = actualMp3 ? actualMp3.replace('.mp3', '') : basePath
            writeSidecarJson(finalBasePath, track, {
              container: playlistDir,
              containerType: 'playlist',
              keepThumbnail: true,
              containerCoverPath
            })
            saveLyricsForTrack(
              (actualMp3 || basePath + '.mp3'),
              track.name,
              track.artist?.name || 'Unknown Artist',
              track.album?.name || null,
              track.duration || null
            )
            event.sender.send('download:progress', {
              id: trackDownloadId,
              type: 'playlist',
              trackName: track.name,
              progress: 100,
              status: 'done',
              trackIndex: i,
              totalTracks: tracks.length
            })
          }).catch((err: any) => {
            if (cancelled || err.message === 'Cancelled') {
              deletePartialFiles(dir, `${trackNum}. ${trackName}`)
              event.sender.send('download:progress', {
                id: trackDownloadId,
                type: 'playlist',
                progress: 0,
                status: 'cancelled',
                trackIndex: i,
                totalTracks: tracks.length
              })
            } else {
              event.sender.send('download:progress', {
                id: trackDownloadId,
                type: 'playlist',
                progress: 0,
                status: 'error',
                error: err.message,
                trackIndex: i,
                totalTracks: tracks.length
              })
            }
          })
        })
        await Promise.allSettled(promises)
      }
    } finally {
      ipcMain.removeListener('download:cancel', cancelHandler)
    }

    if (cancelled) {
      for (let j = 0; j < tracks.length; j++) {
        const nextTrack = tracks[j]
        const nextDownloadId = `${playlistDownloadId}:${nextTrack.videoId}`
        event.sender.send('download:progress', {
          id: nextDownloadId,
          type: 'playlist',
          progress: 0,
          status: 'cancelled',
          trackIndex: j,
          totalTracks: tracks.length
        })
      }
      return { success: false, error: 'Cancelled' }
    }

    event.sender.send('download:progress', {
      id: playlistDownloadId,
      type: 'playlist',
      trackName: playlist.name,
      progress: 100,
      status: 'done'
    })
    return { success: true }
  })
}
