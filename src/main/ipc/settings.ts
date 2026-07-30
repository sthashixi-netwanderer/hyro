import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const CONFIG_DIR = app.getPath('userData')
const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json')

export interface AppSettings {
  groqApiKey: string
  cookieBrowser: string
  volume?: number
  theme?: 'dark' | 'light' | 'system'
  minimizeToTray?: boolean
  maxConcurrentDownloads?: number
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function loadSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { groqApiKey: '', cookieBrowser: '', theme: 'system', minimizeToTray: false }
    const data = readFileSync(SETTINGS_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      groqApiKey: parsed.groqApiKey || '',
      cookieBrowser: parsed.cookieBrowser || '',
      volume: typeof parsed.volume === 'number' ? parsed.volume : undefined,
      theme: parsed.theme || 'system',
      minimizeToTray: typeof parsed.minimizeToTray === 'boolean' ? parsed.minimizeToTray : false,
      maxConcurrentDownloads: typeof parsed.maxConcurrentDownloads === 'number' ? parsed.maxConcurrentDownloads : 1
    }
  } catch {
    return { groqApiKey: '', cookieBrowser: '', theme: 'system', minimizeToTray: false }
  }
}

function saveSettings(settings: Partial<AppSettings>): void {
  ensureConfigDir()
  const existing = loadSettings()
  const merged = { ...existing, ...settings }
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2))
}

export function getGroqApiKey(): string {
  return loadSettings().groqApiKey
}

export function getCookieBrowser(): string {
  return loadSettings().cookieBrowser
}

/**
 * Returns the cookie browser string with a keyring fallback suffix for yt-dlp.
 *
 * On Linux, Chromium-based browsers encrypt cookies with AES-CBC using a key
 * stored in GNOME Keyring / Secret Service. The keyring is often unavailable
 * (headless sessions, D-Bus disconnects) or returns the wrong key (Electron
 * apps creating duplicate "Chromium Safe Storage" entries), causing:
 *   "failed to decrypt cookie (AES-CBC) because UTF-8 decoding failed"
 *
 * The `+basictext` suffix tells yt-dlp to prefer the BASIC_TEXT keyring
 * (unencrypted cookies stored as-is), bypassing the keyring entirely.
 * This is supported by yt-dlp for all Chromium-based browsers.
 *
 * Returns null if cookies are disabled or unavailable.
 */
export function getYtDlpCookieBrowser(): string | null {
  const browser = loadSettings().cookieBrowser
  if (!browser) return null
  const chromiumBrowsers = ['chrome', 'chromium', 'brave', 'edge', 'opera', 'vivaldi']
  if (chromiumBrowsers.includes(browser)) {
    return `${browser}+basictext`
  }
  return browser
}

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:get', async () => {
    return loadSettings()
  })

  ipcMain.handle('settings:save', async (_event, settings: Partial<AppSettings>) => {
    saveSettings(settings)
    return { success: true }
  })
}
