import { ipcMain, app } from 'electron'
import { join, resolve, normalize, relative, dirname } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'fs'

const BASE_DIR = join(homedir(), 'Downloads', 'Hyro')
const CONFIG_DIR = app.getPath('userData')
const REGISTRY_FILE = join(CONFIG_DIR, 'downloaded-tracks.json')

function getSidecarJsonPath(mp3Path: string): string {
  const rel = relative(BASE_DIR, mp3Path)
  const jsonRel = rel.replace(/\.mp3$/i, '.json')
  return join(CONFIG_DIR, 'metadata', jsonRel)
}

/** Verify a file path is strictly within the allowed directory. Prevents path traversal. */
function isPathSafe(filePath: string, allowedDir: string): boolean {
  const resolved = resolve(filePath)
  const normalizedAllowed = normalize(allowedDir)
  return resolved.startsWith(normalizedAllowed + '/') || resolved === normalizedAllowed
}

interface SidecarData {
  videoId: string
  name: string
  artist: { artistId: string | null; name: string }
  album: { albumId: string; name: string } | null
  duration: number | null
  thumbnails: Array<{ url: string; width: number; height: number }>
  type: 'SONG' | 'VIDEO'
  filePath: string
  thumbnailPath: string | null
  downloadedAt: string
  container: string
  containerType: 'artist' | 'album' | 'playlist' | 'single'
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function readRegistry(): SidecarData[] {
  try {
    ensureConfigDir()
    if (!existsSync(REGISTRY_FILE)) return []
    const data = readFileSync(REGISTRY_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRegistry(tracks: SidecarData[]): void {
  ensureConfigDir()
  writeFileSync(REGISTRY_FILE, JSON.stringify(tracks, null, 2))
}

function addToRegistry(track: SidecarData): void {
  const tracks = readRegistry()
  // Replace existing entry with same videoId (re-download case)
  const filtered = tracks.filter(t => t.videoId !== track.videoId)
  filtered.push(track)
  writeRegistry(filtered)
}

function removeFromRegistryByFilePath(filePath: string): void {
  const tracks = readRegistry()
  const filtered = tracks.filter(t => t.filePath !== filePath)
  writeRegistry(filtered)
}

function removeFromRegistryByContainer(container: string): void {
  const tracks = readRegistry()
  const filtered = tracks.filter(t => t.container !== container)
  writeRegistry(filtered)
}

function getContainers(): { name: string; type: string; trackCount: number; thumbnailPath: string | null; thumbnails: Array<{ url: string; width: number; height: number }>; tracks: SidecarData[] }[] {
  const tracks = readRegistry()
  // Only include tracks whose files still exist on disk
  const validTracks = tracks.filter(t => existsSync(t.filePath))

  const containerMap = new Map<string, SidecarData[]>()
  for (const track of validTracks) {
    const container = track.container || 'Unknown'
    if (!containerMap.has(container)) {
      containerMap.set(container, [])
    }
    containerMap.get(container)!.push(track)
  }

  return Array.from(containerMap.entries()).map(([name, containerTracks]) => {
    const firstTrack = containerTracks[0]
    return {
      name,
      type: firstTrack?.containerType || 'single',
      trackCount: containerTracks.length,
      thumbnailPath: firstTrack?.thumbnailPath || null,
      thumbnails: firstTrack?.thumbnails || [],
      tracks: containerTracks
    }
  })
}

export function registerLibraryIPC(): void {
  if (!existsSync(BASE_DIR)) {
    mkdirSync(BASE_DIR, { recursive: true })
  }

  ipcMain.handle('library:getTracks', async () => {
    const tracks = readRegistry()
    // Only return tracks whose files still exist on disk
    const existingTracks = tracks.filter(t => existsSync(t.filePath))
    if (existingTracks.length !== tracks.length) {
      writeRegistry(existingTracks)
    }
    return existingTracks
  })

  ipcMain.handle('library:getContainers', async () => {
    return getContainers()
  })

  ipcMain.handle('library:getContainerTracks', async (_event, containerName: string) => {
    const tracks = readRegistry()
    return tracks.filter(t => t.container === containerName && existsSync(t.filePath))
  })

  ipcMain.handle('library:deleteTrack', async (_event, filePath: string) => {
    try {
      // Validate: filePath must be a string and within the allowed download directory
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Invalid file path' }
      }
      if (!isPathSafe(filePath, BASE_DIR)) {
        return { success: false, error: 'Access denied: path outside download directory' }
      }

      // Delete MP3
      if (existsSync(filePath)) unlinkSync(filePath)

      // Delete sidecar JSON
      const jsonPath = getSidecarJsonPath(filePath)
      if (existsSync(jsonPath)) unlinkSync(jsonPath)

      // Delete thumbnail JPG
      const jpgPath = filePath.replace('.mp3', '.jpg')
      if (existsSync(jpgPath)) unlinkSync(jpgPath)

      // Remove from registry
      removeFromRegistryByFilePath(filePath)

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('library:deleteContainer', async (_event, containerPath: string) => {
    try {
      // Validate: containerPath must be a string and within the allowed download directory
      if (typeof containerPath !== 'string' || !containerPath) {
        return { success: false, error: 'Invalid container path' }
      }
      if (!isPathSafe(containerPath, BASE_DIR)) {
        return { success: false, error: 'Access denied: path outside download directory' }
      }

      // Find the container name from the registry by matching the path
      const tracks = readRegistry()
      const containerTrack = tracks.find(t => containerPath.includes(t.container))
      if (containerTrack) {
        removeFromRegistryByContainer(containerTrack.container)
      }

      if (existsSync(containerPath)) {
        rmSync(containerPath, { recursive: true, force: true })
      }

      // Also delete the metadata folder in CONFIG_DIR
      const relativeContainer = relative(BASE_DIR, containerPath)
      const metadataContainerPath = join(CONFIG_DIR, 'metadata', relativeContainer)
      if (existsSync(metadataContainerPath)) {
        rmSync(metadataContainerPath, { recursive: true, force: true })
      }

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Quick lookup: return filePath for a videoId (or null if not downloaded)
  ipcMain.handle('library:getTrackPath', async (_event, videoId: string) => {
    const tracks = readRegistry()
    const match = tracks.find(t => t.videoId === videoId && existsSync(t.filePath))
    return match ? match.filePath : null
  })

  // Internal: register a downloaded track to the registry (called from download.ts)
  ipcMain.handle('library:registerTrack', async (_event, track: SidecarData) => {
    addToRegistry(track)
    return { success: true }
  })
}

// Export for use by download.ts (non-IPC call)
export { addToRegistry, readRegistry }
