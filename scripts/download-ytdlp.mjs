#!/usr/bin/env node

/**
 * Cross-platform postinstall script that downloads the latest yt-dlp binary
 * from GitHub releases into resources/bin/.
 *
 * Runs automatically via `npm postinstall` hook.
 * Skipped in CI or when SKIP_YT_DLP_DOWNLOAD=1 is set.
 */

import { existsSync, mkdirSync, chmodSync, createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import { platform } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN_DIR = join(ROOT, 'resources', 'bin')

// Skip download if explicitly requested or in CI
if (process.env.SKIP_YT_DLP_DOWNLOAD === '1') {
  console.log('[download-ytdlp] Skipping (SKIP_YT_DLP_DOWNLOAD=1)')
  process.exit(0)
}

/**
 * Determine the correct yt-dlp binary name for the current platform.
 */
function getBinaryInfo() {
  const plat = platform()

  if (plat === 'win32') {
    return { url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', name: 'yt-dlp.exe' }
  }

  if (plat === 'darwin') {
    // yt-dlp_macos is a universal binary (fat binary) supporting both x64 and arm64
    return { url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos', name: 'yt-dlp' }
  }

  // Linux and others
  return { url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux', name: 'yt-dlp' }
}

/**
 * Download a file from URL to destination path.
 */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const followRedirect = (redirectUrl) => {
      https.get(redirectUrl, { headers: { 'User-Agent': 'Hyro Music' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          followRedirect(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${redirectUrl}`))
          return
        }
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      }).on('error', reject)
    }
    followRedirect(url)
  })
}

async function main() {
  const { url, name } = getBinaryInfo()
  const dest = join(BIN_DIR, name)

  // Skip if binary already exists
  if (existsSync(dest)) {
    console.log(`[download-ytdlp] ${name} already exists at ${dest}, skipping`)
    return
  }

  console.log(`[download-ytdlp] Downloading yt-dlp for ${platform()}...`)
  console.log(`[download-ytdlp] URL: ${url}`)

  mkdirSync(BIN_DIR, { recursive: true })

  try {
    await download(url, dest)

    // Set executable permission on Unix
    if (platform() !== 'win32') {
      chmodSync(dest, 0o755)
    }

    console.log(`[download-ytdlp] Downloaded to ${dest}`)
  } catch (err) {
    console.error(`[download-ytdlp] Failed to download yt-dlp: ${err.message}`)
    console.error('[download-ytdlp] The app will fall back to system yt-dlp if available.')
    // Don't fail npm install — the app can still work with system yt-dlp
  }
}

main()
