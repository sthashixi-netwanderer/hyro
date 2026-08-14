import { app } from 'electron'
import { logger, suppressConsole, initLogger, registerLoggerIPC } from './logger'
import { getYtDlpBinaryPath } from './ipc/ytdlp-path'

// Suppress console output in production (still file-logs everything)
suppressConsole()

import { shell, BrowserWindow, protocol, net, ipcMain, Tray, Menu, nativeImage, powerSaveBlocker } from 'electron'
import { join, normalize, resolve } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
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
import { registerLikedSongsIPC } from './ipc/liked-songs'
import { registerPlaylistsIPC } from './ipc/playlists'
import { registerSettingsIPC, loadSettings } from './ipc/settings'
import { registerYtDlpIPC } from './ipc/ytdlp'
import { registerDataUsageIPC } from './ipc/data-usage'
import { registerPlaybackStateIPC } from './ipc/playback-state'
import { registerImageCacheIPC, IMAGE_CACHE_DIR } from './ipc/image-cache'
import { registerUpdateIPC, stopUpdateChecks } from './ipc/update'
import dns from 'node:dns'

// Set application identity for Linux window management and desktop integration.
// Setting app.name and app.desktopName before ready ensures that X11 WM_CLASS and
// Wayland app_id match the installed hyro.desktop file and StartupWMClass=hyro,
// allowing GNOME/KDE/XFCE docks, taskbars, and app menus to display the app icon correctly.
if (process.platform === 'linux') {
  app.name = 'hyro'
  ;(app as any).desktopName = 'hyro.desktop'
}

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
  const candidates: string[] = []
  if (app.isPackaged) {
    if (process.platform === 'win32') candidates.push(join(process.resourcesPath, 'icon.ico'))
    else if (process.platform === 'darwin') candidates.push(join(process.resourcesPath, 'icon.icns'))
    candidates.push(join(process.resourcesPath, 'icon.png'))
    candidates.push(join(process.resourcesPath, 'icons', '512x512.png'))
  } else {
    const dev = join(__dirname, '../../resources')
    if (process.platform === 'win32') candidates.push(join(dev, 'icon.ico'))
    else if (process.platform === 'darwin') candidates.push(join(dev, 'icon.icns'))
    candidates.push(join(dev, 'icon.png'))
    candidates.push(join(dev, 'icons', '512x512.png'))
  }

  // Return the first candidate that actually exists on disk so the window,
  // tray, and dock never receive a broken/missing icon path.
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // fall through to the next candidate
    }
  }

  logger.warn(`App icon could not be found on disk; tried: ${candidates.join(', ')}`)
  return candidates[candidates.length - 1]
}

/**
 * Builds a NativeImage containing all available icon resolutions (16x16 up to 1024x1024)
 * so that X11 window managers (_NET_WM_ICON), Wayland, system tray, and dock render
 * sharp icons at every scale factor.
 */
function getAppIcon(): Electron.NativeImage {
  const icon = nativeImage.createEmpty()
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
  let loaded = 0

  const iconsDir = app.isPackaged
    ? join(process.resourcesPath, 'icons')
    : join(__dirname, '../../resources/icons')

  for (const size of sizes) {
    const iconFile = join(iconsDir, `${size}x${size}.png`)
    try {
      if (existsSync(iconFile)) {
        const rep = nativeImage.createFromPath(iconFile)
        if (!rep.isEmpty()) {
          icon.addRepresentation({
            width: size,
            height: size,
            scaleFactor: 1.0,
            buffer: rep.toPNG()
          })
          loaded++
        }
      }
    } catch {
      // ignore individual size read error
    }
  }

  if (loaded > 0) {
    return icon
  }

  return nativeImage.createFromPath(getIconPath())
}

/** In development on Linux, ensure a user desktop file exists so Wayland/GNOME taskbars show the app icon. */
function ensureDevDesktopFile(): void {
  if (app.isPackaged || process.platform !== 'linux') return
  try {
    const appsDir = join(homedir(), '.local', 'share', 'applications')
    if (!existsSync(appsDir)) {
      mkdirSync(appsDir, { recursive: true })
    }
    const desktopFile = join(appsDir, 'hyro.desktop')
    if (existsSync(desktopFile)) {
      return
    }
    const iconPath = join(__dirname, '../../resources/icon.png')
    const content = [
      '[Desktop Entry]',
      'Name=Hyro Music',
      'Comment=A music streaming app powered by YouTube Music',
      'Exec=hyro',
      `Icon=${iconPath}`,
      'Terminal=false',
      'Type=Application',
      'StartupWMClass=hyro',
      'Categories=Audio;Music;'
    ].join('\n') + '\n'

    writeFileSync(desktopFile, content, 'utf-8')
  } catch (err) {
    logger.debug('Failed to ensure dev desktop file:', err)
  }
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
      // Platform-appropriate tray size: 16px (Win/Linux), 22px template (macOS)
      const traySize = process.platform === 'darwin' ? 22 : 16
      // For ICO/ICNS the image already contains the exact size, so only resize if larger
      if (icon.getSize().width > traySize || icon.getSize().height > traySize) {
        icon = icon.resize({ width: traySize, height: traySize, quality: 'best' })
      }
      if (process.platform === 'darwin') {
        icon.setTemplateImage(false)
      }
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
  const appIcon = getAppIcon()

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
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon)
  }
  
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

  // Grant media permission checks (needed for enumerateDevices to return device labels)
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, _details) => {
    if (permission === 'media') {
      return true
    }
    return false
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

process.on('uncaughtException', (err) => {
  try { logger.error('[uncaughtException]', err) } catch {}
})
process.on('unhandledRejection', (reason) => {
  try { logger.error('[unhandledRejection]', String(reason)) } catch {}
})

app.whenReady().then(async () => {
  initLogger()
  registerLoggerIPC()
  logger.info('App ready', { version: app.getVersion(), platform: process.platform, arch: process.arch })
  electronApp.setAppUserModelId('com.hyro.music')

  // Register dev desktop entry on Linux so dock/taskbar matches and shows the icon in development
  ensureDevDesktopFile()

  // Ensure dock / app menu icon is set from the new brand icon (macOS & Linux)
  try {
    const appIcon = getAppIcon()
    if (!appIcon.isEmpty() && process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(appIcon)
    }
  } catch {
    // ignore dock icon failure
  }

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
  registerLikedSongsIPC()
  registerPlaylistsIPC()
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
