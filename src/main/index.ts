import { app } from 'electron'
import { logger, suppressConsole } from './logger'
import { getYtDlpBinaryPath } from './ipc/ytdlp-path'

// Suppress console output in production
suppressConsole()

import { shell, BrowserWindow, protocol, net, ipcMain, Tray, Menu, nativeImage, powerSaveBlocker } from 'electron'
import { join, normalize, resolve } from 'path'
import { pathToFileURL } from 'url'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { initializeYTMusic, registerMusicIPC, fetchArtistData } from './ipc/music'
import { registerArtistCacheIPC } from './ipc/artist-cache'
import { registerDownloadIPC } from './ipc/download'
import { registerDownloadQueueIPC } from './ipc/download-queue'
import { registerLibraryIPC } from './ipc/library'
import { registerStreamCacheIPC, clearStreamCache } from './ipc/stream-cache'
import { registerHistoryIPC } from './ipc/history'
import { registerFavoritesIPC } from './ipc/favorites'
import { registerSettingsIPC, loadSettings } from './ipc/settings'
import { registerYtDlpIPC } from './ipc/ytdlp'
import { registerDataUsageIPC } from './ipc/data-usage'
import { registerPlaybackStateIPC } from './ipc/playback-state'
import { registerImageCacheIPC, IMAGE_CACHE_DIR } from './ipc/image-cache'
import { registerUpdateIPC, stopUpdateChecks } from './ipc/update'
import dns from 'node:dns'

// Set DNS lookup order to prefer IPv4 over IPv6.
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Ignore if unsupported
}

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
let tray: Tray | null = null
let isQuitting = false
let powerSaveBlockerId: number | null = null

function enablePowerSaveBlocker(): void {
  if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  }
}

function disablePowerSaveBlocker(): void {
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null
  }
}

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

/** Resolve the app icon path — extraResources in production, project root in dev. */
function getIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icon.png')
  }
  return join(__dirname, '../../resources/icon.png')
}

/** Check that yt-dlp is installed and accessible on PATH. */
async function checkYtDlp(): Promise<void> {
  try {
    const { stdout } = await execFileAsync(getYtDlpBinaryPath(), ['--version'], { timeout: 5000 })
    logger.log(`yt-dlp version: ${stdout.trim()}`)
  } catch {
    logger.warn(
      'WARNING: yt-dlp is not installed or not on PATH. ' +
      'Audio streaming and downloads will not work. ' +
      'Install it from https://github.com/yt-dlp/yt-dlp'
    )
  }
}

function createTray(): void {
  try {
    const iconPath = getIconPath()
    let icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16 })
    }

    tray = new Tray(icon)
    tray.setToolTip('Hyro Music')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Hyro Music',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Play / Pause',
        click: () => {
          mainWindow?.webContents.send('tray:player-action', 'toggle-play')
        }
      },
      {
        label: 'Next Track',
        click: () => {
          mainWindow?.webContents.send('tray:player-action', 'next')
        }
      },
      {
        label: 'Previous Track',
        click: () => {
          mainWindow?.webContents.send('tray:player-action', 'prev')
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Hyro Music',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })
  } catch (err) {
    logger.error('Failed to create system tray icon:', err)
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
    transparent: true,
    backgroundColor: '#00000000',
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  
  // Apply rounded corners to the window by setting window background theme
  // The actual rounded corners are handled via CSS in index.html
  // This is a workaround for Electron's lack of native border-radius support with frame: false

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      const settings = loadSettings()
      if (settings.minimizeToTray) {
        event.preventDefault()
        mainWindow?.hide()
        return
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(details.url)
      }
    } catch {
      // Invalid URL
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'speaker-selection') {
      callback(true)
    } else {
      callback(false)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', true)
    enablePowerSaveBlocker()
  })

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', false)
    disablePowerSaveBlocker()
  })

  registerDownloadIPC(mainWindow)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.hyro')

  protocol.handle('media', (request) => {
    const { pathname } = new URL(request.url)
    const filePath = decodeURIComponent(pathname)
    if (!isPathWithin(filePath, DOWNLOAD_DIR, STREAM_CACHE_DIR, IMAGE_CACHE_DIR)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })

  ipcMain.handle('window:setFullScreen', async (_event: any, flag: boolean) => {
    if (mainWindow) {
      mainWindow.setFullScreen(flag)
      if (flag) {
        enablePowerSaveBlocker()
      } else {
        disablePowerSaveBlocker()
      }
      return true
    }
    return false
  })

  ipcMain.handle('window:minimize', async () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximize', async () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })

  ipcMain.handle('window:close', async () => {
    mainWindow?.close()
  })

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

  clearStreamCache()
  checkYtDlp()
  initializeYTMusic().catch(() => {})

  registerMusicIPC()
  registerArtistCacheIPC(fetchArtistData)
  registerLibraryIPC()
  registerDownloadQueueIPC(mainWindow)
  registerStreamCacheIPC()
  registerHistoryIPC()
  registerFavoritesIPC()
  registerSettingsIPC()
  registerYtDlpIPC()
  registerDataUsageIPC()
  registerPlaybackStateIPC()
  registerImageCacheIPC()
  registerUpdateIPC()

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  disablePowerSaveBlocker()
  clearStreamCache()
  stopUpdateChecks()
})
