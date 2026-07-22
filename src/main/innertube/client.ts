/**
 * InnerTube client singleton.
 *
 * youtubei.js is an ES Module, so we use dynamic import() to load it
 * from the Electron main process (which uses CommonJS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let InnertubeClass: any = null
let innertube: any = null
let initializing = false
let initPromise: any = null

/** Load the Innertube class via dynamic import (ESM → CJS bridge). */
async function loadInnertubeClass(): Promise<void> {
  if (InnertubeClass) return
  const mod = await import('youtubei.js')
  InnertubeClass = mod.Innertube
}

/**
 * Get or create the singleton Innertube instance.
 * Uses lazy initialization — the first call creates the instance,
 * subsequent calls return the cached one.
 *
 * If initialization fails, the error propagates and the caller
 * should fall back to ytmusic-api.
 */
export async function getInnertube(): Promise<any> {
  if (innertube) return innertube

  // Deduplicate concurrent initialization requests
  if (initializing && initPromise) return initPromise

  initializing = true
  initPromise = (async () => {
    try {
      await loadInnertubeClass()
      try {
        const dns = await import('node:dns')
        dns.setDefaultResultOrder('ipv4first')
      } catch {
        // Ignore if dns setting is unsupported
      }
      const instance = await InnertubeClass.create({
        lang: 'en',
        location: 'US',
        retrieve_player: true
      })
      innertube = instance
      console.log('[innertube] Initialized successfully')
      return instance
    } catch (err) {
      console.error('[innertube] Initialization failed:', err)
      innertube = null
      initPromise = null
      throw err
    } finally {
      initializing = false
    }
  })()

  return initPromise
}

/**
 * Reset the Innertube instance. Call this when the instance becomes
 * stale (e.g. after repeated stream failures) to force re-initialization
 * on the next getInnertube() call.
 */
export function resetInnertube(force = false): void {
  // If currently initializing, don't wipe the active promise unless forced,
  // to prevent concurrent callers from spawning dozens of simultaneous create() requests.
  if (initializing && initPromise && !force) {
    console.log('[innertube] Reset requested while initialization in progress — joining existing init promise')
    return
  }
  innertube = null
  initPromise = null
  initializing = false
  console.log('[innertube] Reset — will re-initialize on next use')
}

/**
 * Check if the Innertube instance is currently available.
 * Does NOT trigger initialization.
 */
export function isInnertubeReady(): boolean {
  return innertube !== null
}
