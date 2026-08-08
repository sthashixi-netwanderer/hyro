/**
 * Renderer logger that mirrors all logs to the main-process file logger.
 * In dev, also console.log; in prod, only console.error/warn are shown,
 * but all levels are persisted to ~/Hyro logs via IPC.
 */

const isDev = import.meta.env.DEV

function forward(level: string, args: unknown[]): void {
  // Fire-and-forget IPC; never block UI
  try {
    // @ts-ignore window.api is exposed via preload
    window.api?.logToMain?.(level, ...args)?.catch(() => {})
  } catch {}
}

export const logger = {
  log: (...args: unknown[]): void => {
    forward('info', args)
    if (isDev) console.log(...args)
  },
  warn: (...args: unknown[]): void => {
    forward('warn', args)
    console.warn(...args)
  },
  error: (...args: unknown[]): void => {
    forward('error', args)
    console.error(...args)
  },
  debug: (...args: unknown[]): void => {
    forward('debug', args)
    if (isDev) console.debug(...args)
  },
  info: (...args: unknown[]): void => {
    forward('info', args)
    if (isDev) console.info(...args)
  }
}
