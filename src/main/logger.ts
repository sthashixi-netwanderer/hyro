import { app, shell, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync, statSync, renameSync, unlinkSync, readFileSync, readdirSync } from 'fs'

const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_LOG_FILES = 3
const LOG_FILE_NAME = 'hyro.log'
const LOG_DIR_NAME = 'logs'

let logStreamReady = false
let logDir: string | null = null
let logFile: string | null = null
let writeQueue: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function getLogDir(): string {
  if (logDir) return logDir
  try {
    // app.getPath may throw if called before ready — fallback to temp
    logDir = join(app.getPath('userData'), LOG_DIR_NAME)
  } catch {
    const fallback = join(app.getPath('temp'), 'hyro-logs')
    logDir = fallback
  }
  return logDir!
}

function getLogFilePath(): string {
  if (logFile) return logFile
  logFile = join(getLogDir(), LOG_FILE_NAME)
  return logFile
}

function ensureLogDir(): void {
  const dir = getLogDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  logStreamReady = true
}

function rotateIfNeeded(): void {
  try {
    const file = getLogFilePath()
    if (!existsSync(file)) return
    const stat = statSync(file)
    if (stat.size < MAX_LOG_SIZE) return

    // Rotate: hyro.log -> hyro.1.log -> hyro.2.log -> hyro.3.log (oldest deleted)
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const src = join(getLogDir(), i === 1 ? LOG_FILE_NAME : `hyro.${i - 1}.log`)
      const dest = join(getLogDir(), `hyro.${i}.log`)
      if (existsSync(src)) {
        if (existsSync(dest)) unlinkSync(dest)
        renameSync(src, dest)
      }
    }
    // Current file is now hyro.1.log in loop, but we moved hyro.log -> hyro.1.log at i=1
  } catch {
    // ignore rotation errors
  }
}

function formatArgs(level: string, args: unknown[]): string {
  const ts = new Date().toISOString()
  const msg = args.map(a => {
    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`
    if (typeof a === 'object') {
      try { return JSON.stringify(a) } catch { return String(a) }
    }
    return String(a)
  }).join(' ')
  return `[${ts}] [${level.toUpperCase()}] ${msg}\n`
}

function flushQueue(): void {
  if (writeQueue.length === 0) return
  const batch = writeQueue.join('')
  writeQueue = []
  try {
    ensureLogDir()
    rotateIfNeeded()
    appendFileSync(getLogFilePath(), batch, 'utf-8')
  } catch {
    // swallow — logging must never crash app
  }
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushQueue()
  }, 50)
}

function writeToFile(level: string, args: unknown[]): void {
  const line = formatArgs(level, args)
  writeQueue.push(line)
  scheduleFlush()
  // Also keep console in dev for immediate feedback
}

const isDev = !app.isPackaged

export const logger = {
  log: (...args: unknown[]): void => {
    writeToFile('info', args)
    if (isDev) console.log(...args)
  },
  info: (...args: unknown[]): void => {
    writeToFile('info', args)
    if (isDev) console.info(...args)
  },
  warn: (...args: unknown[]): void => {
    writeToFile('warn', args)
    console.warn(...args)
  },
  error: (...args: unknown[]): void => {
    writeToFile('error', args)
    console.error(...args)
  },
  debug: (...args: unknown[]): void => {
    writeToFile('debug', args)
    if (isDev) console.debug(...args)
  }
}

export const suppressConsole = (): void => {
  if (!isDev) {
    const origLog = console.log
    const origDebug = console.debug
    const origInfo = console.info
    // Keep warn/error visible; suppress verbose logs but still file-log them
    console.log = (...a: unknown[]) => { writeToFile('info', a); /* suppressed */ void origLog }
    console.debug = (...a: unknown[]) => { writeToFile('debug', a); void origDebug }
    console.info = (...a: unknown[]) => { writeToFile('info', a); void origInfo }
  }
}

export function initLogger(): void {
  try {
    ensureLogDir()
    // Write session header
    const header = `\n========== Hyro session started at ${new Date().toISOString()} (v${app.getVersion()}, ${process.platform} ${process.arch}, packaged=${app.isPackaged}) ==========\n`
    writeQueue.push(header)
    scheduleFlush()
    logger.info(`Log file: ${getLogFilePath()}`)
  } catch (e) {
    console.error('Failed to init logger', e)
  }
}

export function getLogPath(): string {
  return getLogFilePath()
}

export function readRecentLogs(maxBytes = 500 * 1024): string {
  try {
    const file = getLogFilePath()
    if (!existsSync(file)) return ''
    const stat = statSync(file)
    if (stat.size <= maxBytes) return readFileSync(file, 'utf-8')
    // Read tail
    const fd = readFileSync(file, 'utf-8')
    return fd.slice(-maxBytes)
  } catch {
    return ''
  }
}

export function clearLogs(): void {
  try {
    const dir = getLogDir()
    if (!existsSync(dir)) return
    const files = readdirSync(dir)
    for (const f of files) {
      if (f.startsWith('hyro') && f.endsWith('.log')) {
        try { unlinkSync(join(dir, f)) } catch {}
      }
    }
    writeQueue = []
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  } catch {}
}

export function registerLoggerIPC(): void {
  ipcMain.handle('log:getPath', () => getLogPath())
  ipcMain.handle('log:read', (_e, maxBytes?: number) => readRecentLogs(maxBytes))
  ipcMain.handle('log:clear', () => { clearLogs(); return { success: true } })
  ipcMain.handle('log:open', async () => {
    try {
      const p = getLogPath()
      ensureLogDir()
      // Ensure file exists so shell.openPath doesn't fail on first open
      if (!existsSync(p)) appendFileSync(p, '', 'utf-8')
      await shell.openPath(getLogDir())
      return { success: true, path: getLogDir() }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })
  // Renderer -> main forwarding (so renderer logs also hit the file)
  ipcMain.handle('log:renderer', (_e, level: string, ...args: unknown[]) => {
    const safeLevel = ['log','info','warn','error','debug'].includes(level) ? level : 'info'
    writeToFile(`renderer:${safeLevel}`, args)
    return { success: true }
  })
}

// Flush on exit
try {
  process.on('exit', () => { if (writeQueue.length) flushQueue() })
  process.on('beforeExit', () => { if (writeQueue.length) flushQueue() })
} catch {}
