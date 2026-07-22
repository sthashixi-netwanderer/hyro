import { app, shell, BrowserWindow, protocol, net, ipcMain } from 'electron'
import { join, normalize, resolve } from 'path'
import { pathToFileURL } from 'url'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { initializeYTMusic, registerMusicIPC } from './ipc/music'
import { registerDownloadIPC } from './ipc/download'
import { registerDownloadQueueIPC } from './ipc/download-queue'
import { registerLibraryIPC } from './ipc/library'
import { registerStreamCacheIPC, clearStreamCache } from './ipc/stream-cache'
import { registerHistoryIPC } from './ipc/history'
import { registerFavoritesIPC } from './ipc/favorites'
import { registerSettingsIPC } from './ipc/settings'
import { registerYtDlpIPC } from './ipc/ytdlp'
import dns from 'node:dns'

// Set DNS lookup order to prefer IPv4 over IPv6.
// Node/undici default verbatim lookup attempts unreachable IPv6 (2001:4860:...) routes on many
// networks, resulting in connect ENETUNREACH / ETIMEDOUT during InnerTube and API initialization.
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Ignore if unsupported
}

// Register the custom media:// protocol as privileged.
// MUST be called before app.whenReady() — Electron freezes scheme privileges at ready.
// The `stream` privilege is critical for HTMLAudioElement playback (enables HTTP range
// requests for seeking). Without this, file:// URLs are blocked by Chromium's security
// model in the renderer (cross-origin from http://localhost in dev, or restricted by
// file-access policies in production).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

const execFileAsync = promisify(execFile)

/** Verify a file path is strictly within one of the allowed directories. */
function isPathWithin(filePath: string, ...allowedDirs: string[]): boolean {
  const resolved = resolve(filePath)
  return allowedDirs.some(dir => {
    const normalized = normalize(dir)
    return resolved.startsWith(normalized + '/') || resolved === normalized
  })
}

const DOWNLOAD_DIR = join(homedir(), 'Downloads', 'Hyro')
const STREAM_CACHE_DIR = join(app.getPath('userData'), 'stream-cache')

/** Check that yt-dlp is installed and accessible on PATH. */
async function checkYtDlp(): Promise<void> {
  try {
    const { stdout } = await execFileAsync('yt-dlp', ['--version'], { timeout: 5000 })
    console.log(`yt-dlp version: ${stdout.trim()}`)
  } catch {
    console.warn(
      'WARNING: yt-dlp is not installed or not on PATH. ' +
      'Audio streaming and downloads will not work. ' +
      'Install it from https://github.com/yt-dlp/yt-dlp'
    )
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#0a0a0a',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only allow http/https URLs to prevent javascript:, file:, or custom scheme abuse
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(details.url)
      }
    } catch {
      // Invalid URL — do not open
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Register fullscreen listeners to keep the renderer in sync
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', true)
  })

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', false)
  })

  // Register download IPC handlers
  registerDownloadIPC(mainWindow)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.hyro')

  // Handle media:// protocol requests by serving local files via net.fetch.
  // URLs have the form media://local/absolute/path/to/file.mp3 where "local" is
  // the hostname and the pathname is the absolute file path.
  // SECURITY: Only serve files from allowed directories to prevent path traversal.
  protocol.handle('media', (request) => {
    const { pathname } = new URL(request.url)
    const filePath = decodeURIComponent(pathname)
    if (!isPathWithin(filePath, DOWNLOAD_DIR, STREAM_CACHE_DIR)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })

  // Handle window fullscreen requests
  ipcMain.handle('window:setFullScreen', async (_event: any, flag: boolean) => {
    if (mainWindow) {
      mainWindow.setFullScreen(flag)
      return true
    }
    return false
  })

  // Handle window minimize
  ipcMain.handle('window:minimize', async () => {
    mainWindow?.minimize()
  })

  // Handle window maximize
  ipcMain.handle('window:maximize', async () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })

  // Handle window close
  ipcMain.handle('window:close', async () => {
    mainWindow?.close()
  })

  // Open external URLs safely
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        await shell.openExternal(url)
        return { success: true }
      }
      return { success: false, error: 'Only http/https URLs are allowed' }
    } catch {
      return { success: false, error: 'Invalid URL' }
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Clear stream cache on launch (crash recovery from previous session)
  clearStreamCache()

  // Check yt-dlp availability (non-blocking warning if missing)
  checkYtDlp()

  // Initialize ytmusic-api in background (non-blocking) — it's now the fallback
  // for InnerTube. InnerTube initializes lazily on first use.
  initializeYTMusic().catch(() => {})

  // Register IPC handlers
  registerMusicIPC()
  registerLibraryIPC()
  registerDownloadQueueIPC()
  registerStreamCacheIPC()
  registerHistoryIPC()
  registerFavoritesIPC()
  registerSettingsIPC()
  registerYtDlpIPC()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clear stream cache on quit (cleanup temporary files)
app.on('before-quit', () => {
  clearStreamCache()
})
