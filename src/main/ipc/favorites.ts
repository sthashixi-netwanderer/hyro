import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const CONFIG_DIR = app.getPath('userData')
const FAVORITES_FILE = join(CONFIG_DIR, 'favorites.json')

interface FavoriteItem {
  id: string
  type: 'track' | 'album' | 'playlist' | 'artist'
  data: any
  addedAt: string
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function readFavorites(): FavoriteItem[] {
  try {
    ensureConfigDir()
    if (!existsSync(FAVORITES_FILE)) return []
    const data = readFileSync(FAVORITES_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeFavorites(items: FavoriteItem[]): void {
  ensureConfigDir()
  writeFileSync(FAVORITES_FILE, JSON.stringify(items, null, 2))
}

function addFavorite(item: { id: string; type: string; data: any }): FavoriteItem[] {
  const favorites = readFavorites()
  // Remove existing entry with same id and type (re-add case)
  const filtered = favorites.filter(f => !(f.id === item.id && f.type === item.type))
  filtered.unshift({
    id: item.id,
    type: item.type as FavoriteItem['type'],
    data: item.data,
    addedAt: new Date().toISOString()
  })
  writeFavorites(filtered)
  return filtered
}

function removeFavorite(id: string, type: string): FavoriteItem[] {
  const favorites = readFavorites()
  const filtered = favorites.filter(f => !(f.id === id && f.type === type))
  writeFavorites(filtered)
  return filtered
}

function isFavorited(id: string, type: string): boolean {
  const favorites = readFavorites()
  return favorites.some(f => f.id === id && f.type === type)
}

function getFavorites(): FavoriteItem[] {
  return readFavorites()
}

export function registerFavoritesIPC(): void {
  ensureConfigDir()

  ipcMain.handle('favorites:get', async () => {
    return getFavorites()
  })

  ipcMain.handle('favorites:add', async (_event, item: { id: string; type: string; data: any }) => {
    return addFavorite(item)
  })

  ipcMain.handle('favorites:remove', async (_event, id: string, type: string) => {
    return removeFavorite(id, type)
  })

  ipcMain.handle('favorites:check', async (_event, id: string, type: string) => {
    return isFavorited(id, type)
  })
}
