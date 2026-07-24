import { logger } from '../logger'
import { logger } from '../logger'
import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { DataUsageStats, TimeframeUsage, DailyUsageRecord } from '../../shared/types'

const CONFIG_DIR = app.getPath('userData')
const DATA_USAGE_FILE = join(CONFIG_DIR, 'data-usage.json')

let sessionBytes = 0

function getTodayKey(d = new Date()): string {
  return d.toISOString().split('T')[0]
}

function emptyTimeframe(): TimeframeUsage {
  return {
    totalBytes: 0,
    streamingBytes: 0,
    cacheBytes: 0,
    downloadBytes: 0,
    tracksPlayedCount: 0
  }
}

function getDefaultStats(): DataUsageStats {
  const now = new Date().toISOString()
  return {
    totalBytes: 0,
    streamingBytes: 0,
    cacheBytes: 0,
    downloadBytes: 0,
    tracksPlayedCount: 0,
    sessionBytes: 0,
    lastResetDate: now,
    today: emptyTimeframe(),
    thisWeek: emptyTimeframe(),
    thisMonth: emptyTimeframe(),
    dailyHistory: {}
  }
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function loadDataUsage(): DataUsageStats {
  try {
    if (!existsSync(DATA_USAGE_FILE)) return getDefaultStats()
    const raw = readFileSync(DATA_USAGE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)

    const totalBytes = typeof parsed.totalBytes === 'number' ? parsed.totalBytes : 0
    const streamingBytes = typeof parsed.streamingBytes === 'number' ? parsed.streamingBytes : 0
    const cacheBytes = typeof parsed.cacheBytes === 'number' ? parsed.cacheBytes : 0
    const downloadBytes = typeof parsed.downloadBytes === 'number' ? parsed.downloadBytes : 0
    const tracksPlayedCount = typeof parsed.tracksPlayedCount === 'number' ? parsed.tracksPlayedCount : 0
    const lastResetDate = parsed.lastResetDate || new Date().toISOString()
    const dailyHistory: Record<string, DailyUsageRecord> = parsed.dailyHistory || {}

    // Calculate Today, This Week (last 7 days), and This Month (last 30 days)
    const now = new Date()
    const todayKey = getTodayKey(now)

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

    const today = emptyTimeframe()
    const thisWeek = emptyTimeframe()
    const thisMonth = emptyTimeframe()

    for (const [dateStr, rec] of Object.entries(dailyHistory)) {
      if (!rec) continue
      const entryDate = new Date(dateStr)
      const s = rec.streamingBytes || 0
      const c = rec.cacheBytes || 0
      const d = rec.downloadBytes || 0
      const tCount = rec.tracksPlayedCount || 0
      const entryTotal = s + c + d

      if (dateStr === todayKey) {
        today.totalBytes += entryTotal
        today.streamingBytes += s
        today.cacheBytes += c
        today.downloadBytes += d
        today.tracksPlayedCount += tCount
      }

      if (entryDate >= sevenDaysAgo) {
        thisWeek.totalBytes += entryTotal
        thisWeek.streamingBytes += s
        thisWeek.cacheBytes += c
        thisWeek.downloadBytes += d
        thisWeek.tracksPlayedCount += tCount
      }

      if (entryDate >= thirtyDaysAgo) {
        thisMonth.totalBytes += entryTotal
        thisMonth.streamingBytes += s
        thisMonth.cacheBytes += c
        thisMonth.downloadBytes += d
        thisMonth.tracksPlayedCount += tCount
      }
    }

    return {
      totalBytes,
      streamingBytes,
      cacheBytes,
      downloadBytes,
      tracksPlayedCount,
      sessionBytes,
      lastResetDate,
      today,
      thisWeek,
      thisMonth,
      dailyHistory
    }
  } catch {
    return getDefaultStats()
  }
}

export function recordDataUsage(
  bytes: number,
  type: 'stream' | 'cache' | 'download' = 'stream',
  trackPlayed = false
): DataUsageStats {
  ensureConfigDir()
  const stats = loadDataUsage()
  const validBytes = Math.max(0, Math.round(bytes))
  const todayKey = getTodayKey()

  stats.totalBytes += validBytes
  sessionBytes += validBytes
  stats.sessionBytes = sessionBytes

  if (type === 'stream') {
    stats.streamingBytes += validBytes
  } else if (type === 'cache') {
    stats.cacheBytes += validBytes
  } else if (type === 'download') {
    stats.downloadBytes += validBytes
  }

  if (trackPlayed) {
    stats.tracksPlayedCount += 1
  }

  // Update daily history log
  if (!stats.dailyHistory[todayKey]) {
    stats.dailyHistory[todayKey] = {
      streamingBytes: 0,
      cacheBytes: 0,
      downloadBytes: 0,
      tracksPlayedCount: 0
    }
  }

  const todayRecord = stats.dailyHistory[todayKey]
  if (type === 'stream') todayRecord.streamingBytes += validBytes
  else if (type === 'cache') todayRecord.cacheBytes += validBytes
  else if (type === 'download') todayRecord.downloadBytes += validBytes

  if (trackPlayed) {
    todayRecord.tracksPlayedCount += 1
  }

  try {
    writeFileSync(DATA_USAGE_FILE, JSON.stringify(stats, null, 2))
  } catch (err) {
    logger.error('[data-usage] Failed to save usage data:', err)
  }

  return loadDataUsage()
}

export function resetDataUsage(): DataUsageStats {
  ensureConfigDir()
  sessionBytes = 0
  const now = new Date().toISOString()
  const resetStats: DataUsageStats = {
    totalBytes: 0,
    streamingBytes: 0,
    cacheBytes: 0,
    downloadBytes: 0,
    tracksPlayedCount: 0,
    sessionBytes: 0,
    lastResetDate: now,
    today: emptyTimeframe(),
    thisWeek: emptyTimeframe(),
    thisMonth: emptyTimeframe(),
    dailyHistory: {}
  }
  try {
    writeFileSync(DATA_USAGE_FILE, JSON.stringify(resetStats, null, 2))
  } catch (err) {
    logger.error('[data-usage] Failed to reset usage data:', err)
  }
  return resetStats
}

export function registerDataUsageIPC(): void {
  ipcMain.handle('data-usage:get', async () => {
    return loadDataUsage()
  })

  ipcMain.handle(
    'data-usage:record',
    async (
      _event,
      payload: { bytes: number; type?: 'stream' | 'cache' | 'download'; trackPlayed?: boolean }
    ) => {
      const { bytes = 0, type = 'stream', trackPlayed = false } = payload || {}
      return recordDataUsage(bytes, type, trackPlayed)
    }
  )

  ipcMain.handle('data-usage:reset', async () => {
    return resetDataUsage()
  })
}
