import { logger } from '../logger'
import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const CONFIG_DIR = app.getPath('userData')
const STATE_FILE = join(CONFIG_DIR, 'playback-state.json')

export interface SavedPlaybackState {
  currentTrack: any | null
  queue: any[]
  originalQueue?: any[]
  queueIndex: number
  currentTime: number
  volume: number
  repeatMode: 'off' | 'all' | 'one'
  isShuffled: boolean
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function saveState(data: SavedPlaybackState): void {
  try {
    ensureConfigDir()
    writeFileSync(STATE_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    logger.error('Failed to save playback state:', err)
  }
}

function loadState(): SavedPlaybackState | null {
  try {
    if (!existsSync(STATE_FILE)) return null
    const raw = readFileSync(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        currentTrack: parsed.currentTrack || null,
        queue: Array.isArray(parsed.queue) ? parsed.queue : [],
        originalQueue: Array.isArray(parsed.originalQueue) ? parsed.originalQueue : (Array.isArray(parsed.queue) ? parsed.queue : []),
        queueIndex: typeof parsed.queueIndex === 'number' ? parsed.queueIndex : -1,
        currentTime: typeof parsed.currentTime === 'number' ? parsed.currentTime : 0,
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.8,
        repeatMode: ['off', 'all', 'one'].includes(parsed.repeatMode) ? parsed.repeatMode : 'off',
        isShuffled: typeof parsed.isShuffled === 'boolean' ? parsed.isShuffled : false
      }
    }
    return null
  } catch {
    return null
  }
}

export function registerPlaybackStateIPC(): void {
  ipcMain.handle('player-state:save', async (_event, state: SavedPlaybackState) => {
    saveState(state)
    return { success: true }
  })

  ipcMain.handle('player-state:load', async () => {
    return loadState()
  })
}
