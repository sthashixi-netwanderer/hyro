import type { Thumbnail } from './types'

/** Upgrade a thumbnail URL to its highest possible resolution. */
export function highResUrl(url: string | undefined): string | undefined {
  if (!url) return url

  // 1. Google User Content / Ggpht URLs (YouTube Music cover arts)
  if (url.includes('googleusercontent.com/') || url.includes('ggpht.com/')) {
    // Replace width/height parameters with square size parameters (e.g. =w120-h120 -> =w1200-h1200)
    if (/=w\d+-h\d+/.test(url)) {
      return url.replace(/=w\d+-h\d+/, '=w1200-h1200')
    }
    // Replace square size parameter if it exists (e.g. =s120, =s88-c -> =w1200-h1200)
    // Anchored to '=' or ',' to avoid matching '-sNNN' inside compound params like =w540-h300-l90-rp-s256-no-rj
    if (/[=,]s\d+/.test(url)) {
      return url.replace(/([=,])s\d+(?:-c)?/, '$1w1200-h1200')
    }
    if (!url.includes('=')) {
      return `${url}=w1200-h1200-l90-rj`
    }
    return url
  }

  // 2. Regular YouTube video thumbnails (e.g., from search/video results)
  // Convert standard /default.jpg to /hqdefault.jpg (guaranteed to exist and much higher quality)
  if (url.includes('ytimg.com/vi/')) {
    return url.replace(/\/default\.jpg/, '/hqdefault.jpg')
  }

  return url
}

/** Get the best (highest resolution) thumbnail from an array. */
export function bestThumbnail(thumbnails: Thumbnail[] | undefined): Thumbnail | undefined {
  if (!thumbnails || !Array.isArray(thumbnails) || thumbnails.length === 0) return undefined
  let best: Thumbnail | undefined
  for (const t of thumbnails) {
    if (!t || !t.url || typeof t.url !== 'string') continue
    if (typeof t.width === 'number' && typeof t.height === 'number' && t.width > 0 && t.height > 0) {
      if (!best || (typeof best.width === 'number' && typeof best.height === 'number' && t.width * t.height > best.width * best.height)) {
        best = t
      }
    } else if (!best) {
      best = t
    }
  }
  if (!best) {
    const valid = thumbnails.filter((t) => t && t.url)
    best = valid.length > 0 ? valid[valid.length - 1] : undefined
  }
  return best
}

/** Get the best thumbnail URL, falling back to a default. */
export function bestThumbnailUrl(thumbnails: Thumbnail[] | undefined): string | undefined {
  const url = bestThumbnail(thumbnails)?.url
  return highResUrl(url)
}

/** Get the display thumbnail URL for a track, preferring local files. */
export function getTrackThumbnailUrl(track: { thumbnailPath?: string | null; thumbnails?: Thumbnail[] }): string | undefined {
  if (track.thumbnailPath) {
    return `media://local${track.thumbnailPath}`
  }
  return bestThumbnailUrl(track.thumbnails)
}
