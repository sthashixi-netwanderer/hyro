/**
 * Logger utility for the renderer process.
 * In development, all logs are shown. In production, only errors/warnings are shown.
 */
const isDev = import.meta.env.DEV

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