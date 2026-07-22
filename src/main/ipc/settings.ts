import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const CONFIG_DIR = app.getPath('userData')
const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json')

interface AppSettings {
  groqApiKey: string
  cookieBrowser: string
  volume?: number
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function loadSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { groqApiKey: '', cookieBrowser: '' }
    const data = readFileSync(SETTINGS_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      groqApiKey: parsed.groqApiKey || '',
      cookieBrowser: parsed.cookieBrowser || '',
      volume: typeof parsed.volume === 'number' ? parsed.volume : undefined
    }
  } catch {
    return { groqApiKey: '', cookieBrowser: '' }
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

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:get', async () => {
    return loadSettings()
  })

  ipcMain.handle('settings:save', async (_event, settings: Partial<AppSettings>) => {
    saveSettings(settings)
    return { success: true }
  })
}
