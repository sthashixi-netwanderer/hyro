import { join } from 'path'
import { app } from 'electron'
import { platform } from 'os'
import { existsSync } from 'fs'

/**
 * Get the path to the yt-dlp binary.
 *
 * - **Packaged app**: uses the bundled binary from extraResources (`resources/bin/yt-dlp`).
 * - **Development**: falls back to system `yt-dlp` on PATH.
 *
 * This ensures users don't need to install yt-dlp manually — it's shipped
 * inside the app resources.
 */
export function getYtDlpBinaryPath(): string {
  const ext = platform() === 'win32' ? '.exe' : ''

  // Production: bundled in extraResources
  if (app.isPackaged) {
    const bundledPath = join(process.resourcesPath, 'bin', `yt-dlp${ext}`)
    if (existsSync(bundledPath)) return bundledPath
  }

  // Development or fallback: use system yt-dlp on PATH
  return `yt-dlp${ext}`
}
