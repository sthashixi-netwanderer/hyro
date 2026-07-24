import { app } from 'electron'

const isDev = !app.isPackaged

/**
 * Logger utility that suppresses console output in production builds.
 * In development, all logs are shown. In production, only errors/warnings are shown.
 */
export const logger = {
  log: (...args: unknown[]): void => {
    if (isDev) {
      console.log(...args)
    }
  },
  warn: (...args: unknown[]): void => {
    if (isDev) {
      console.warn(...args)
    }
  },
  error: (...args: unknown[]): void => {
    // Always show errors
    console.error(...args)
  },
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.debug(...args)
    }
  },
  info: (...args: unknown[]): void => {
    if (isDev) {
      console.info(...args)
    }
  }
}

// Export a no-op console for production suppression
export const suppressConsole = (): void => {
  if (!isDev) {
    console.log = () => {}
    console.debug = () => {}
    console.info = () => {}
    // Keep warn and error in production for debugging
  }
}