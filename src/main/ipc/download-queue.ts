import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const CONFIG_DIR = app.getPath('userData')
const QUEUE_FILE = join(CONFIG_DIR, 'download-queue.json')

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function saveQueue(items: any[]): void {
  ensureConfigDir()
  writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2))
}

function loadQueue(): any[] {
  try {
    if (!existsSync(QUEUE_FILE)) return []
    const data = readFileSync(QUEUE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function registerDownloadQueueIPC(): void {
  ipcMain.handle('download-queue:save', async (_event, items: any[]) => {
    saveQueue(items)
    return { success: true }
  })

  ipcMain.handle('download-queue:load', async () => {
    return loadQueue()
  })
}
