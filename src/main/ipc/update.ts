import { app, ipcMain, shell, BrowserWindow, net } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync, chmodSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { logger } from '../logger'

const GITHUB_REPO = 'sthashixi-netwanderer/hyro'
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let checkTimer: ReturnType<typeof setInterval> | null = null
let latestRelease: { version: string; body: string; htmlUrl: string } | null = null

function parseVersion(v: string): [number, number, number] {
  const cleaned = v.replace(/^v/, '').split('-')[0]
  const parts = cleaned.split('.').map(Number)
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}

function isNewer(latest: string, current: string): boolean {
  const [a, b, c] = parseVersion(latest)
  const [x, y, z] = parseVersion(current)
  if (a > x) return true
  if (a < x) return false
  if (b > y) return true
  if (b < y) return false
  return c > z
}

function fetchLatestRelease(): Promise<{
  version: string
  body: string
  htmlUrl: string
  assets: { name: string; url: string; size: number }[]
}> {
  return new Promise((resolve, reject) => {
    const request = net.request(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
    request.setHeader('Accept', 'application/vnd.github.v3+json')
    request.setHeader('User-Agent', `HyroMusic/${app.getVersion()}`)

    let body = ''
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${response.statusCode}`))
        return
      }
      response.on('data', (chunk) => {
        body += chunk.toString()
      })
      response.on('end', () => {
        try {
          const release = JSON.parse(body)
          resolve({
            version: release.tag_name?.replace(/^v/, '') || '',
            body: release.body || '',
            htmlUrl: release.html_url || '',
            assets: (release.assets || []).map((a: any) => ({
              name: a.name,
              url: a.browser_download_url,
              size: a.size
            }))
          })
        } catch (err) {
          reject(err)
        }
      })
    })
    request.on('error', reject)
    request.end()
  })
}

function getAssetPattern(): string | null {
  switch (process.platform) {
    case 'linux':
      if (process.arch === 'x64') return '.AppImage'
      if (process.arch === 'arm64') return '.AppImage'
      return null
    case 'darwin':
      return '.dmg'
    case 'win32':
      if (process.arch === 'x64') return 'x64.exe'
      if (process.arch === 'arm64') return 'arm64.exe'
      return '.exe'
    default:
      return null
  }
}

async function doCheck(): Promise<{
  available: boolean
  version?: string
  body?: string
  htmlUrl?: string
}> {
  try {
    const currentVersion = app.getVersion()
    const release = await fetchLatestRelease()

    if (!release.version) {
      return { available: false }
    }

    if (isNewer(release.version, currentVersion)) {
      latestRelease = release
      return {
        available: true,
        version: release.version,
        body: release.body,
        htmlUrl: release.htmlUrl
      }
    }

    latestRelease = null
    return { available: false }
  } catch (err) {
    logger.error('Update check failed:', err)
    return { available: false }
  }
}

function sendUpdateToRenderer(data: {
  available: boolean
  version?: string
  body?: string
  htmlUrl?: string
}) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('update:available', data)
    }
  }
}

// ---------------------------------------------------------------------------
// Platform-specific self-update functions
// ---------------------------------------------------------------------------

/**
 * Linux (AppImage): Replace the running AppImage in-place.
 * The new AppImage is copied over the old one via a helper script that waits
 * for the process to exit, then relaunches.
 */
async function performLinuxUpdate(newFilePath: string, win: BrowserWindow): Promise<void> {
  // process.env.APPIMAGE is set when running as an AppImage
  const currentAppImage = process.env.APPIMAGE
  if (!currentAppImage) {
    // Not running as AppImage — fallback to opening the file
    logger.warn('Not running as AppImage, opening downloaded file instead')
    shell.openPath(newFilePath)
    setTimeout(() => app.quit(), 1000)
    return
  }

  // Create a helper shell script that waits for the app to quit,
  // replaces the old AppImage, and relaunches.
  const scriptContent = `#!/bin/bash
# Wait for the old Hyro process to exit
while pgrep -f "AppRun" > /dev/null 2>&1; do
  sleep 0.5
done

# Small extra delay to ensure file handles are released
sleep 1

# Replace the old AppImage with the new one
cp -f "${newFilePath}" "${currentAppImage}"
chmod +x "${currentAppImage}"

# Clean up the downloaded copy
rm -f "${newFilePath}"

# Clean up the downloads directory
rm -rf "${join(tmpdir(), 'hyro-updates')}"

# Clean up the helper script itself
rm -f "$0"

# Relaunch
"${currentAppImage}" &
`

  const scriptPath = join(tmpdir(), 'hyro-updater.sh')
  writeFileSync(scriptPath, scriptContent)
  chmodSync(scriptPath, 0o755)

  logger.log(`Linux self-update: script at ${scriptPath}`)
  logger.log(`Replacing ${currentAppImage} with ${newFilePath}`)

  // Launch the updater script detached from the process
  const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' })
  child.unref()

  // Quit the current app
  app.quit()
}

/**
 * macOS: Mount the DMG, copy the .app bundle to /Applications, unmount, restart.
 */
async function performMacUpdate(dmgPath: string, win: BrowserWindow): Promise<void> {
  const appName = 'Hyro Music'
  const applicationsDir = '/Applications'
  const appBundlePath = join(applicationsDir, `${appName}.app`)
  const volumePath = `/Volumes/${appName}`

  // Create a helper shell script for the macOS update
  const scriptContent = `#!/bin/bash
set -e

# Mount the DMG silently
hdiutil attach "${dmgPath}" -nobrowse -quiet

# Wait for the volume to appear
for i in $(seq 1 20); do
  if [ -d "${volumePath}" ]; then break fi
  sleep 0.5
done

# Copy the new app bundle over the existing one
if [ -d "${volumePath}/${appName}.app" ]; then
  rm -rf "${appBundlePath}"
  cp -R "${volumePath}/${appName}.app" "${appBundlePath}"
fi

# Unmount the DMG
hdiutil detach "${volumePath}" -quiet 2>/dev/null || true

# Clean up the downloaded DMG
rm -f "${dmgPath}"

# Clean up the downloads directory
rm -rf "${join(tmpdir(), 'hyro-updates')}"

# Clean up the helper script
rm -f "$0"

# Relaunch the app
open -a "${appBundlePath}"
`

  const scriptPath = join(tmpdir(), 'hyro-updater.sh')
  writeFileSync(scriptPath, scriptContent)
  chmodSync(scriptPath, 0o755)

  logger.log(`macOS self-update: script at ${scriptPath}`)

  // Launch the updater script detached
  const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' })
  child.unref()

  // Quit the current app
  app.quit()
}

/**
 * Windows: Run the NSIS installer silently, which handles replacing files.
 * A helper batch script waits for the installer to finish, then cleans up.
 */
async function performWindowsUpdate(installerPath: string, win: BrowserWindow): Promise<void> {
  logger.log(`Windows self-update: launching installer at ${installerPath}`)

  const downloadDir = join(tmpdir(), 'hyro-updates')

  // Create a helper batch script that waits for the installer to finish,
  // then cleans up the installer and downloads directory.
  const scriptContent = `@echo off
REM Wait for the NSIS installer to finish
:check_loop
tasklist /FI "IMAGENAME eq ${installerPath.split('\\').pop()}" 2>NUL | find /I "${installerPath.split('\\').pop()}" >NUL
if %ERRORLEVEL% == 0 (
    timeout /t 1 /nobreak >NUL
    goto check_loop
)

REM Clean up the installer
del /f /q "${installerPath}" 2>NUL

REM Clean up the downloads directory
rmdir /s /q "${downloadDir}" 2>NUL

REM Clean up this helper script
del /f /q "%~f0" 2>NUL
`

  const scriptPath = join(tmpdir(), 'hyro-cleanup.bat')
  writeFileSync(scriptPath, scriptContent)

  // Launch the installer detached
  const child = spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' })
  child.unref()

  // Launch the cleanup script detached (it will wait for the installer to finish)
  const cleanupChild = spawn('cmd.exe', ['/c', scriptPath], { detached: true, stdio: 'ignore' })
  cleanupChild.unref()

  // Give the installer a moment to initialize, then quit
  setTimeout(() => app.quit(), 500)
}

export function registerUpdateIPC(): void {
  ipcMain.handle('update:check', async () => {
    const result = await doCheck()
    return result
  })

  ipcMain.handle('update:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('update:download', async (_event, htmlUrl: string) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return { success: false, error: 'No window found' }

    const pattern = getAssetPattern()
    if (!pattern) {
      return {
        success: false,
        error: 'No update available for this platform. Check the releases page manually.'
      }
    }

    try {
      const release = await fetchLatestRelease()
      const asset = release.assets.find((a) => a.name.includes(pattern))

      if (!asset) {
        shell.openExternal(htmlUrl)
        return { success: true, opened: true }
      }

      const downloadDir = join(tmpdir(), 'hyro-updates')
      if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true })

      const filePath = join(downloadDir, asset.name)

      // Download the update asset with progress reporting
      await new Promise<void>((resolve, reject) => {
        const request = net.request(asset.url)
        request.setHeader('User-Agent', `HyroMusic/${app.getVersion()}`)

        let receivedBytes = 0
        const totalBytes = asset.size

        request.on('response', (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${response.statusCode}`))
            return
          }

          const chunks: Buffer[] = []
          response.on('data', (chunk) => {
            chunks.push(Buffer.from(chunk))
            receivedBytes += chunk.length
            if (totalBytes > 0) {
              const progress = Math.round((receivedBytes / totalBytes) * 100)
              win.webContents.send('update:download-progress', progress)
            }
          })
          response.on('end', () => {
            const buffer = Buffer.concat(chunks)
            writeFileSync(filePath, buffer)
            resolve()
          })
        })

        request.on('error', reject)
        request.end()
      })

      logger.log(`Update downloaded to: ${filePath}`)

      // Platform-specific self-update: replace current app and restart
      if (process.platform === 'linux') {
        await performLinuxUpdate(filePath, win)
      } else if (process.platform === 'darwin') {
        await performMacUpdate(filePath, win)
      } else if (process.platform === 'win32') {
        await performWindowsUpdate(filePath, win)
      } else {
        // Fallback: open the downloaded file and schedule cleanup
        shell.openPath(filePath)

        // Create a delayed cleanup script
        const cleanupScript = `#!/bin/bash
sleep 5
rm -f "${filePath}"
rm -rf "${join(tmpdir(), 'hyro-updates')}"
rm -f "$0"
`
        const cleanupPath = join(tmpdir(), 'hyro-cleanup.sh')
        writeFileSync(cleanupPath, cleanupScript)
        chmodSync(cleanupPath, 0o755)
        const cleanupChild = spawn('bash', [cleanupPath], { detached: true, stdio: 'ignore' })
        cleanupChild.unref()

        setTimeout(() => app.quit(), 1000)
      }

      return { success: true }
    } catch (err) {
      logger.error('Update download failed:', err)

      // Clean up any partially downloaded files
      try {
        const downloadDir = join(tmpdir(), 'hyro-updates')
        if (existsSync(downloadDir)) rmSync(downloadDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }

      shell.openExternal(htmlUrl)
      return { success: true, opened: true }
    }
  })

  // Start periodic checks after 30 seconds
  setTimeout(() => {
    doCheck().then(sendUpdateToRenderer)
    checkTimer = setInterval(() => {
      doCheck().then(sendUpdateToRenderer)
    }, CHECK_INTERVAL_MS)
  }, 30_000)
}

export function stopUpdateChecks(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
