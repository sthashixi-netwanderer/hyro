import { app, ipcMain, shell, BrowserWindow, net } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync, chmodSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { spawn, execSync } from 'child_process'
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

// ---------------------------------------------------------------------------
// Linux distro detection
// ---------------------------------------------------------------------------

interface LinuxDistroInfo {
  id: string
  idLike: string
  versionId: string
  prettyName: string
}

function getLinuxDistroInfo(): LinuxDistroInfo | null {
  try {
    const content = readFileSync('/etc/os-release', 'utf-8')
    const info: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const idx = trimmed.indexOf('=')
      const key = trimmed.slice(0, idx)
      let value = trimmed.slice(idx + 1)
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      info[key] = value.toLowerCase()
    }
    return {
      id: info['ID'] || '',
      idLike: info['ID_LIKE'] || '',
      versionId: info['VERSION_ID'] || '',
      prettyName: info['PRETTY_NAME'] || info['NAME'] || ''
    }
  } catch {
    return null
  }
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}

function getLinuxPackageType(): '.deb' | '.rpm' | null {
  const distro = getLinuxDistroInfo()

  // Known Debian-family identifiers
  const debIds = new Set([
    'debian',
    'ubuntu',
    'linuxmint',
    'mint',
    'pop',
    'pop_os',
    'elementary',
    'zorin',
    'kali',
    'raspbian',
    'neon',
    'kde_neon'
  ])

  // Known RHEL/Fedora-family identifiers
  const rpmIds = new Set([
    'fedora',
    'rhel',
    'centos',
    'rocky',
    'alma',
    'almalinux',
    'amzn',
    'amazon',
    'ol',
    'scientific'
  ])

  // openSUSE / SUSE family
  const suseIds = new Set([
    'opensuse',
    'opensuse-leap',
    'opensuse-tumbleweed',
    'suse',
    'sled',
    'sles'
  ])

  if (distro) {
    const { id, idLike } = distro
    const idLikeTokens = idLike.split(/\s+/).filter(Boolean)

    // Direct ID match
    if (debIds.has(id)) return '.deb'
    if (rpmIds.has(id) || suseIds.has(id)) return '.rpm'

    // ID_LIKE fallback (e.g. Ubuntu has ID_LIKE=debian, Mint has ID_LIKE=ubuntu)
    for (const token of idLikeTokens) {
      if (debIds.has(token) || token === 'debian' || token === 'ubuntu') return '.deb'
      if (rpmIds.has(token) || suseIds.has(token) || token === 'fedora' || token === 'rhel' || token === 'suse' || token === 'centos') return '.rpm'
    }

    // Heuristic for ID_LIKE containing strings
    if (idLike.includes('debian') || idLike.includes('ubuntu')) return '.deb'
    if (idLike.includes('fedora') || idLike.includes('rhel') || idLike.includes('centos') || idLike.includes('suse')) return '.rpm'
    if (idLike.includes('arch')) {
      // Arch family: no native deb/rpm in Hyro releases; pick available manager as hint
      if (isCommandAvailable('apt') || isCommandAvailable('dpkg')) return '.deb'
      if (isCommandAvailable('dnf') || isCommandAvailable('yum') || isCommandAvailable('zypper') || isCommandAvailable('rpm')) return '.rpm'
      // Default to deb as most users can use debtap, but will fallback to browser if asset missing
      return '.deb'
    }

    logger.log(`Unknown Linux distro id="${id}" id_like="${idLike}", probing package managers`)
  } else {
    logger.log('Could not read /etc/os-release, probing package managers')
  }

  // Probe installed package managers when distro detection is inconclusive
  if (isCommandAvailable('apt') || isCommandAvailable('dpkg') || isCommandAvailable('apt-get')) return '.deb'
  if (isCommandAvailable('dnf') || isCommandAvailable('yum') || isCommandAvailable('zypper') || isCommandAvailable('rpm')) return '.rpm'

  // Last resort defaults to deb for x64 systems where deb is most common
  logger.warn('Could not determine Linux package type, defaulting to .deb')
  return '.deb'
}

function findBestLinuxAsset(
  assets: { name: string; url: string; size: number }[],
  pattern: '.deb' | '.rpm'
): { name: string; url: string; size: number } | undefined {
  let candidates = assets.filter((a) => a.name.endsWith(pattern))
  if (candidates.length === 0) {
    // Loose match fallback (handles .deb vs .DEB etc.)
    candidates = assets.filter((a) => a.name.toLowerCase().includes(pattern))
  }
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]

  // Prefer arch-appropriate asset when multiple match
  const arch = process.arch
  let archHint = ''
  if (pattern === '.deb') {
    if (arch === 'x64') archHint = 'amd64'
    else if (arch === 'arm64') archHint = 'arm64'
  } else if (pattern === '.rpm') {
    if (arch === 'x64') archHint = 'x86_64'
    else if (arch === 'arm64') archHint = 'aarch64'
  }

  if (archHint) {
    const match = candidates.find((c) => c.name.includes(archHint))
    if (match) return match
  }

  return candidates[0]
}

function getAssetPattern(): string | null {
  switch (process.platform) {
    case 'linux': {
      const pkgType = getLinuxPackageType()
      if (pkgType) {
        // Never return AppImage for auto-update; native package only
        // AppImage is for manual runs only per requirements
        logger.log(`Linux package type detected: ${pkgType}`)
        return pkgType
      }
      return null
    }
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
 * Linux: Install native package (.deb / .rpm) via privileged package manager.
 * Uses pkexec to show a graphical sudo password prompt, then installs and
 * restarts the app. AppImage is intentionally NOT used for auto-update
 * (manual runs only).
 */
async function performLinuxUpdate(newFilePath: string, _win: BrowserWindow): Promise<void> {
  const isDeb = newFilePath.endsWith('.deb')
  const isRpm = newFilePath.endsWith('.rpm')

  if (!isDeb && !isRpm) {
    logger.warn(`Linux update: unknown package type for ${newFilePath}, opening file`)
    shell.openPath(newFilePath)
    setTimeout(() => app.quit(), 1000)
    return
  }

  logger.log(`Linux update: installing ${isDeb ? '.deb' : '.rpm'} package ${newFilePath} via privileged installer`)

  // Build the privileged install command
  let installShellCmd: string
  if (isDeb) {
    // Prefer apt for dependency resolution; fallback to dpkg + apt-get -f
    if (isCommandAvailable('apt')) {
      installShellCmd = `apt install -y "${newFilePath}" || { dpkg -i "${newFilePath}" && apt-get install -f -y; }`
    } else if (isCommandAvailable('apt-get')) {
      installShellCmd = `dpkg -i "${newFilePath}" && apt-get install -f -y`
    } else {
      installShellCmd = `dpkg -i "${newFilePath}"`
    }
  } else {
    // RPM family: detect manager
    if (isCommandAvailable('dnf')) {
      installShellCmd = `dnf install -y "${newFilePath}"`
    } else if (isCommandAvailable('yum')) {
      installShellCmd = `yum install -y "${newFilePath}"`
    } else if (isCommandAvailable('zypper')) {
      installShellCmd = `zypper --non-interactive install -y "${newFilePath}" || zypper install -y "${newFilePath}"`
    } else {
      installShellCmd = `rpm -Uvh --force "${newFilePath}" || rpm -ivh --force "${newFilePath}"`
    }
  }

  const hasPkexec = isCommandAvailable('pkexec')

  if (!hasPkexec) {
    logger.warn('pkexec not found, falling back to opening package file with system handler')
    // System handler (e.g. GNOME Software, Discover) will prompt for sudo itself
    shell.openPath(newFilePath)
    // Schedule cleanup after a delay; keep app running so handler can be dismissed
    const cleanupScript = `#!/bin/bash
sleep 10
rm -f "${newFilePath}"
rm -rf "${join(tmpdir(), 'hyro-updates')}"
rm -f "$0"
`
    const cleanupPath = join(tmpdir(), 'hyro-cleanup.sh')
    writeFileSync(cleanupPath, cleanupScript)
    chmodSync(cleanupPath, 0o755)
    const cleanupChild = spawn('bash', [cleanupPath], { detached: true, stdio: 'ignore' })
    cleanupChild.unref()
    return
  }

  // Execute via pkexec which shows a graphical password prompt
  const installed = await new Promise<boolean>((resolve) => {
    const child = spawn('pkexec', ['bash', '-c', installShellCmd], {
      stdio: 'ignore',
      detached: false
    })

    child.on('error', (err) => {
      logger.error('pkexec spawn error:', err)
      resolve(false)
    })

    child.on('close', (code) => {
      logger.log(`Privileged install exited with code ${code}`)
      resolve(code === 0)
    })
  })

  if (!installed) {
    logger.error('Linux package install failed or was cancelled by user')
    // Keep downloaded file for retry; do not quit
    // Optionally open releases page was already handled in caller fallback,
    // but here we just return with error pushed to renderer via quit avoidance
    // Notify renderer that install did not succeed (reuse download-progress channel to reset)
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send('update:download-progress', 0)
    }
    // Do not quit; leave app running so user can retry or open releases page manually
    return
  }

  logger.log('Linux package install succeeded, cleaning up and restarting app')

  // Clean up downloaded file and temp directory
  try {
    rmSync(newFilePath, { force: true })
  } catch {}
  try {
    const downloadDir = join(tmpdir(), 'hyro-updates')
    if (existsSync(downloadDir)) rmSync(downloadDir, { recursive: true, force: true })
  } catch {}

  // Restart the app to load the new version
  // For deb/rpm the executable path remains the same; app.relaunch uses that
  // Use a short delay to ensure file handles are released, then relaunch via
  // helper script so restart survives regardless of exec path changes
  const restartScript = `#!/bin/bash
sleep 1
# Try common launch methods in order
if command -v hyro >/dev/null 2>&1; then
  nohup hyro >/dev/null 2>&1 &
elif [ -x "/opt/Hyro Music/hyro" ]; then
  nohup "/opt/Hyro Music/hyro" >/dev/null 2>&1 &
elif [ -x "/usr/bin/hyro" ]; then
  nohup /usr/bin/hyro >/dev/null 2>&1 &
else
  # Fallback: try to relaunch via Electron's recorded exe path if still exists
  if [ -x "${app.getPath('exe')}" ]; then
    nohup "${app.getPath('exe')}" >/dev/null 2>&1 &
  fi
fi
rm -f "$0"
`
  const scriptPath = join(tmpdir(), 'hyro-restart.sh')
  try {
    writeFileSync(scriptPath, restartScript)
    chmodSync(scriptPath, 0o755)
    const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch (err) {
    logger.error('Failed to create restart script, falling back to app.relaunch:', err)
    try {
      app.relaunch()
    } catch {}
  }

  // Quit current instance; helper script will launch the updated app
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
      let asset: { name: string; url: string; size: number } | undefined

      if (process.platform === 'linux') {
        // Distro-aware selection with arch filtering; never AppImage
        asset = findBestLinuxAsset(release.assets, pattern as '.deb' | '.rpm')
        if (!asset) {
          logger.warn(`No ${pattern} asset found for Linux, opening releases page`)
          shell.openExternal(htmlUrl)
          return { success: true, opened: true }
        }
      } else {
        asset = release.assets.find((a) => a.name.includes(pattern))
      }

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
