import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'

const execFileAsync = promisify(execFile)

async function getYtDlpVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('yt-dlp', ['--version'])
    return stdout.trim()
  } catch {
    return null
  }
}

async function getYtDlpPath(): Promise<string | null> {
  try {
    const cmd = platform() === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(cmd, ['yt-dlp'])
    return stdout.trim().split('\n')[0]?.trim() || null
  } catch {
    return null
  }
}

type InstallMethod = 'pip' | 'pipx' | 'homebrew' | 'standalone'

async function detectInstallMethod(): Promise<InstallMethod> {
  const ytdlpPath = await getYtDlpPath()
  if (!ytdlpPath) return 'standalone'

  const lowerPath = ytdlpPath.toLowerCase()

  if (platform() === 'win32') {
    if (lowerPath.includes('pipx')) return 'pipx'
    if (lowerPath.includes('scripts') || lowerPath.includes('python')) return 'pip'
    return 'standalone'
  }

  // macOS / Linux
  if (lowerPath.includes('pipx')) return 'pipx'
  if (lowerPath.includes('pip') || lowerPath.includes('site-packages')) return 'pip'
  if (lowerPath.includes('homebrew') || lowerPath.includes('cellar')) return 'homebrew'
  return 'standalone'
}

async function updateYtDlp(): Promise<{ success: boolean; message: string; version: string | null }> {
  const method = await detectInstallMethod()

  try {
    if (method === 'pip') {
      const { stdout, stderr } = await execFileAsync('pip', ['-U', 'yt-dlp'], { timeout: 120000 })
      const output = stdout + stderr
      if (output.includes('already up to date') || output.includes('Successfully installed') || output.includes('Requirement already satisfied')) {
        const newVersion = await getYtDlpVersion()
        return {
          success: true,
          message: output.includes('already up to date') || output.includes('Requirement already satisfied')
            ? 'yt-dlp is already up to date'
            : `Updated to ${newVersion}`,
          version: newVersion
        }
      }
      const newVersion = await getYtDlpVersion()
      return { success: true, message: output.trim() || 'Update completed', version: newVersion }
    }

    if (method === 'pipx') {
      const { stdout, stderr } = await execFileAsync('pipx', ['upgrade', 'yt-dlp'], { timeout: 120000 })
      const output = stdout + stderr
      const newVersion = await getYtDlpVersion()
      if (output.includes('already up to date') || output.includes('no upgrade')) {
        return { success: true, message: 'yt-dlp is already up to date', version: newVersion }
      }
      return { success: true, message: `Updated to ${newVersion}`, version: newVersion }
    }

    if (method === 'homebrew') {
      const { stdout, stderr } = await execFileAsync('brew', ['upgrade', 'yt-dlp'], { timeout: 120000 })
      const output = stdout + stderr
      const newVersion = await getYtDlpVersion()
      if (output.includes('already up-to-date') || output.includes('No such formula')) {
        return { success: true, message: 'yt-dlp is already up to date', version: newVersion }
      }
      return { success: true, message: `Updated to ${newVersion}`, version: newVersion }
    }

    // Standalone binary — yt-dlp -U works
    const { stdout, stderr } = await execFileAsync('yt-dlp', ['-U'], { timeout: 120000 })
    const output = stdout + stderr
    if (output.includes('already up to date') || output.includes('Upgrading')) {
      const newVersion = await getYtDlpVersion()
      return {
        success: true,
        message: output.includes('already up to date')
          ? 'yt-dlp is already up to date'
          : `Updated to ${newVersion}`,
        version: newVersion
      }
    }
    const newVersion = await getYtDlpVersion()
    return { success: true, message: output.trim() || 'Update completed', version: newVersion }
  } catch (err: any) {
    return { success: false, message: err.message || 'Update failed', version: null }
  }
}

function getLatestReleaseVersion(): Promise<{ version: string; url: string } | null> {
  return fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    headers: { 'User-Agent': 'Hyro Music v1.0.0' }
  })
    .then(res => {
      if (!res.ok) return null
      return res.json() as Promise<{ tag_name: string; html_url: string }>
    })
    .then(data => {
      if (!data) return null
      return { version: data.tag_name.replace(/^yt-dlp-?/, ''), url: data.html_url }
    })
    .catch(() => null)
}

export function registerYtDlpIPC(): void {
  ipcMain.handle('ytdlp:getVersion', async () => {
    const version = await getYtDlpVersion()
    return { installed: version !== null, version }
  })

  ipcMain.handle('ytdlp:checkUpdate', async () => {
    const current = await getYtDlpVersion()
    const [latest, installMethod] = await Promise.all([getLatestReleaseVersion(), detectInstallMethod()])
    return {
      installed: current !== null,
      currentVersion: current,
      latestVersion: latest?.version ?? null,
      releaseUrl: latest?.url ?? null,
      updateAvailable: current !== null && latest !== null && current !== latest.version,
      installMethod
    }
  })

  ipcMain.handle('ytdlp:update', async () => {
    const current = await getYtDlpVersion()
    if (!current) {
      return { success: false, error: 'yt-dlp is not installed' }
    }
    return updateYtDlp()
  })
}
