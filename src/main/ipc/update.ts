import { app, ipcMain, shell, BrowserWindow, net } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
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

      shell.openPath(filePath)

      setTimeout(() => {
        app.quit()
      }, 1000)

      return { success: true }
    } catch (err) {
      logger.error('Update download failed:', err)
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
