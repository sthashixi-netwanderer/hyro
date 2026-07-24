import { logger } from '../logger'
import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import { getYtDlpBinaryPath } from './ytdlp-path'

const execFileAsync = promisify(execFile)

async function getYtDlpVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(getYtDlpBinaryPath(), ['--version'])
    return stdout.trim()
  } catch {
    return null
  }
}

async function getYtDlpPath(): Promise<string | null> {
  try {
    const binaryPath = getYtDlpBinaryPath()
    // If the bundled binary exists, return it directly
    if (binaryPath !== 'yt-dlp' && binaryPath !== 'yt-dlp.exe') {
      return binaryPath
    }
    // Fall back to system PATH lookup
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
    if (
      lowerPath.includes('scripts') ||
      lowerPath.includes('python') ||
      lowerPath.includes('anaconda') ||
      lowerPath.includes('miniconda') ||
      lowerPath.includes('conda') ||
      lowerPath.includes('.local')
    ) return 'pip'
    return 'standalone'
  }

  // macOS / Linux
  if (lowerPath.includes('pipx')) return 'pipx'
  if (
    lowerPath.includes('pip') ||
    lowerPath.includes('site-packages') ||
    lowerPath.includes('anaconda') ||
    lowerPath.includes('miniconda') ||
    lowerPath.includes('conda') ||
    lowerPath.includes('python') ||
    lowerPath.includes('.local')
  ) return 'pip'
  if (lowerPath.includes('homebrew') || lowerPath.includes('cellar') || lowerPath.includes('opt/homebrew')) return 'homebrew'

  return 'standalone'
}

async function updateYtDlp(): Promise<{ success: boolean; message: string; version: string | null; error?: string }> {
  const method = await detectInstallMethod()
  const initialVersion = await getYtDlpVersion()

  const attempts: { name: string; cmd: string; args: string[] }[] = []

  if (method === 'pip') {
    attempts.push(
      { name: 'pip', cmd: 'pip', args: ['install', '-U', 'yt-dlp'] },
      { name: 'pip3', cmd: 'pip3', args: ['install', '-U', 'yt-dlp'] },
      { name: 'pip --user', cmd: 'pip', args: ['install', '--user', '-U', 'yt-dlp'] },
      { name: 'yt-dlp native', cmd: getYtDlpBinaryPath(), args: ['-U'] }
    )
  } else if (method === 'pipx') {
    attempts.push(
      { name: 'pipx', cmd: 'pipx', args: ['upgrade', 'yt-dlp'] },
      { name: 'pip', cmd: 'pip', args: ['install', '-U', 'yt-dlp'] },
      { name: 'yt-dlp native', cmd: getYtDlpBinaryPath(), args: ['-U'] }
    )
  } else if (method === 'homebrew') {
    attempts.push(
      { name: 'homebrew', cmd: 'brew', args: ['upgrade', 'yt-dlp'] },
      { name: 'yt-dlp native', cmd: getYtDlpBinaryPath(), args: ['-U'] }
    )
  } else {
    // Standalone binary or fallback
    attempts.push(
      { name: 'yt-dlp native', cmd: getYtDlpBinaryPath(), args: ['-U'] },
      { name: 'pip', cmd: 'pip', args: ['install', '-U', 'yt-dlp'] },
      { name: 'pip3', cmd: 'pip3', args: ['install', '-U', 'yt-dlp'] },
      { name: 'pip --user', cmd: 'pip', args: ['install', '--user', '-U', 'yt-dlp'] }
    )
  }

  let lastError = ''

  for (const attempt of attempts) {
    try {
      logger.log(`[ytdlp:update] Trying update via ${attempt.name}: ${attempt.cmd} ${attempt.args.join(' ')}`)
      const { stdout, stderr } = await execFileAsync(attempt.cmd, attempt.args, { timeout: 180000 })
      const output = (stdout + '\n' + stderr).trim()
      logger.log(`[ytdlp:update] ${attempt.name} output:`, output)

      const newVersion = await getYtDlpVersion()
      if (
        output.includes('already up to date') ||
        output.includes('Requirement already satisfied') ||
        output.includes('Successfully installed') ||
        output.includes('Upgrading') ||
        output.includes('already up-to-date') ||
        (newVersion && initialVersion && newVersion !== initialVersion)
      ) {
        return {
          success: true,
          message: newVersion ? `Updated to v${newVersion}` : 'yt-dlp updated successfully',
          version: newVersion
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || err?.stderr || String(err)
      logger.warn(`[ytdlp:update] Attempt ${attempt.name} failed:`, errMsg)
      lastError = errMsg
    }
  }

  const finalVersion = await getYtDlpVersion()
  if (finalVersion && initialVersion && finalVersion !== initialVersion) {
    return {
      success: true,
      message: `Updated to v${finalVersion}`,
      version: finalVersion
    }
  }

  return {
    success: false,
    message: 'Update failed',
    error: lastError || 'Could not update yt-dlp. Try running pip install -U yt-dlp in terminal.',
    version: finalVersion
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
