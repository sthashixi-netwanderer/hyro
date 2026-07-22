/**
 * Type mappers: Convert youtubei.js response objects to Hyro's shared types.
 *
 * youtubei.js returns rich parsed objects (MusicResponsiveListItem, MusicTwoRowItem, etc.)
 * with flexible shapes. These helpers normalize them into the strict Track/Album/Playlist/Artist
 * types defined in src/shared/types.ts.
 */

import type { Thumbnail, ArtistBasic, AlbumBasic, Track, Album, Playlist, Artist, SearchResults, HomeSection } from '../../shared/types'

// ── Safe text extraction ─────────────────────────────────────────

/**
 * Safely extract a plain string from a youtubei.js value.
 *
 * youtubei.js v17 returns rich `Text` objects (with keys like `text`, `runs`,
 * `endpoint`, etc.) for many fields that look like strings. React cannot render
 * these objects and will throw "Objects are not valid as a React child".
 *
 * This helper normalises any value to a plain string:
 *  - string  → returned as-is
 *  - object with `.text` (Text object) → returns `.text`
 *  - nullish → returns the fallback (default: 'Unknown')
 */
function safeText(value: unknown, fallback = 'Unknown'): string {
  if (typeof value === 'string') return value || fallback
  if (value && typeof value === 'object' && 'text' in value) {
    const t = (value as { text: unknown }).text
    return typeof t === 'string' ? t || fallback : fallback
  }
  return fallback
}

/** Stress force and probe for artist name and ID across rich inner structures. */
export function extractArtistFromItem(item: any, fallbackArtist?: ArtistBasic): ArtistBasic {
  let artistId: string | null = null
  let name = ''

  // 1. Direct fields: artists, authors, author, owner, channel, creator
  if (item?.artists && Array.isArray(item.artists) && item.artists.length > 0) {
    const a = item.artists[0]
    if (a?.name || a?.text) {
      name = safeText(a.name || a.text, '')
      artistId = a.channel_id || a.endpoint?.payload?.browseId || a.id || null
    }
  }
  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    if (item?.authors && Array.isArray(item.authors) && item.authors.length > 0) {
      const a = item.authors[0]
      if (a?.name || a?.text) {
        name = safeText(a.name || a.text, '')
        artistId = a.channel_id || a.endpoint?.payload?.browseId || a.id || null
      }
    }
  }
  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    if (item?.author) {
      if (typeof item.author === 'string') {
        name = safeText(item.author, '')
      } else {
        name = safeText(item.author.name || item.author.text || item.author, '')
        artistId = item.author.channel_id || item.author.endpoint?.payload?.browseId || item.channel_id || null
      }
    }
  }

  // 2. Check flex_columns / flexColumns / columns
  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    const cols = item?.flex_columns || item?.flexColumns || []
    if (Array.isArray(cols)) {
      for (const col of cols) {
        const runs = col?.title?.runs || col?.text?.runs || col?.runs || []
        if (Array.isArray(runs)) {
          for (const run of runs) {
            const bId = run?.endpoint?.payload?.browseId
            if (bId && (bId.startsWith('UC') || bId.startsWith('FEmusic'))) {
              name = safeText(run.text || run.name, '')
              artistId = bId
              break
            }
          }
          if (!name || name === 'Unknown' || name === 'Unknown Artist') {
            for (const run of runs) {
              const t = safeText(run?.text || run?.name, '')
              const lower = t.toLowerCase()
              if (
                t &&
                t !== '•' &&
                !t.includes('•') &&
                lower !== 'song' &&
                lower !== 'video' &&
                lower !== 'album' &&
                lower !== 'single' &&
                lower !== 'playlist' &&
                !/^\d+:\d+$/.test(t) &&
                !/^\d{4}$/.test(t) &&
                t !== safeText(item?.title, '')
              ) {
                name = t
                artistId = run?.endpoint?.payload?.browseId || null
                break
              }
            }
          }
          if (name && name !== 'Unknown' && name !== 'Unknown Artist') break
        }
      }
    }
  }

  // 3. Check subtitle runs / text
  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    if (item?.subtitle?.runs && Array.isArray(item.subtitle.runs)) {
      for (const run of item.subtitle.runs) {
        const bId = run?.endpoint?.payload?.browseId
        if (bId && (bId.startsWith('UC') || bId.startsWith('FEmusic'))) {
          name = safeText(run.text || run.name, '')
          artistId = bId
          break
        }
      }
      if (!name || name === 'Unknown' || name === 'Unknown Artist') {
        for (const run of item.subtitle.runs) {
          const t = safeText(run?.text || run?.name, '')
          const lower = t.toLowerCase()
          if (
            t &&
            t !== '•' &&
            !t.includes('•') &&
            lower !== 'song' &&
            lower !== 'video' &&
            lower !== 'album' &&
            lower !== 'single' &&
            !/^\d+:\d+$/.test(t) &&
            !/^\d{4}$/.test(t) &&
            t !== safeText(item?.title, '')
          ) {
            name = t
            artistId = run?.endpoint?.payload?.browseId || null
            break
          }
        }
      }
    } else if (item?.subtitle) {
      const subStr = typeof item.subtitle === 'string' ? item.subtitle : safeText(item.subtitle.text || item.subtitle, '')
      if (subStr && subStr !== 'Unknown') {
        const parts = subStr.split(' • ').map((p: string) => p.trim())
        for (const part of parts) {
          const lower = part.toLowerCase()
          if (
            part &&
            lower !== 'song' &&
            lower !== 'video' &&
            lower !== 'album' &&
            lower !== 'single' &&
            !/^\d+:\d+$/.test(part) &&
            !/^\d{4}$/.test(part) &&
            part !== safeText(item?.title, '')
          ) {
            name = part
            break
          }
        }
      }
    }
  }

  // 4. Check byline / runs / long_byline_text / short_byline_text
  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    const bylineObj = item?.byline || item?.long_byline_text || item?.short_byline_text || item?.runs
    const runs = Array.isArray(bylineObj) ? bylineObj : bylineObj?.runs || []
    for (const run of runs) {
      const bId = run?.endpoint?.payload?.browseId
      if (bId && (bId.startsWith('UC') || bId.startsWith('FEmusic'))) {
        name = safeText(run.text || run.name, '')
        artistId = bId
        break
      }
    }
    if (!name || name === 'Unknown' || name === 'Unknown Artist') {
      for (const run of runs) {
        const t = safeText(run?.text || run?.name, '')
        const lower = t.toLowerCase()
        if (
          t &&
          t !== '•' &&
          !t.includes('•') &&
          lower !== 'song' &&
          lower !== 'video' &&
          !/^\d+:\d+$/.test(t) &&
          t !== safeText(item?.title, '')
        ) {
          name = t
          artistId = run?.endpoint?.payload?.browseId || null
          break
        }
      }
    }
  }

  // 5. Fallback to passed fallbackArtist if available
  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    if (fallbackArtist?.name && fallbackArtist.name !== 'Unknown' && fallbackArtist.name !== 'Unknown Artist') {
      name = fallbackArtist.name
      artistId = fallbackArtist.artistId || artistId
    }
  }

  if (!name || name.trim() === '') {
    name = fallbackArtist?.name || 'Unknown'
    artistId = fallbackArtist?.artistId || artistId || null
  }

  return { artistId, name }
}

/** Stress force and probe for all artists across rich inner structures. */
export function extractArtistsFromItem(item: any, fallbackArtist?: ArtistBasic): ArtistBasic[] {
  const artists: ArtistBasic[] = []

  // 1. Direct fields: artists
  if (item?.artists && Array.isArray(item.artists) && item.artists.length > 0) {
    for (const a of item.artists) {
      const name = safeText(a.name || a.text, '')
      if (name) {
        artists.push({
          name,
          artistId: a.channel_id || a.endpoint?.payload?.browseId || a.id || null
        })
      }
    }
  }

  // 2. Direct fields: authors
  if (artists.length === 0 && item?.authors && Array.isArray(item.authors) && item.authors.length > 0) {
    for (const a of item.authors) {
      const name = safeText(a.name || a.text, '')
      if (name) {
        artists.push({
          name,
          artistId: a.channel_id || a.endpoint?.payload?.browseId || a.id || null
        })
      }
    }
  }

  // Helper to extract from runs list before the first bullet separator
  const extractFromRuns = (runs: any[]) => {
    const list: ArtistBasic[] = []
    for (const run of runs) {
      const text = safeText(run?.text || run?.name, '').trim()
      if (!text) continue

      // If we hit a bullet separator, stop processing artists
      if (text === '•' || text.includes('•') || text.includes('\u2022') || text.includes('\u00b7')) {
        break
      }

      const lower = text.toLowerCase()
      // Skip joiners/conjunctions
      if (
        lower === '&' ||
        lower === ',' ||
        lower === 'and' ||
        lower === 'feat.' ||
        lower === 'feat' ||
        lower === 'featuring' ||
        lower === '+' ||
        lower === 'with'
      ) {
        continue
      }

      // Check if it looks like a duration, category, or year to be safe
      if (
        lower === 'song' ||
        lower === 'video' ||
        lower === 'album' ||
        lower === 'single' ||
        lower === 'playlist' ||
        /^\d+:\d+$/.test(text) ||
        /^\d{4}$/.test(text) ||
        text === safeText(item?.title, '').trim()
      ) {
        continue
      }

      const bId = run?.endpoint?.payload?.browseId || null
      list.push({
        name: text,
        artistId: bId
      })
    }
    return list
  }

  // 3. flex_columns runs
  if (artists.length === 0) {
    const cols = item?.flex_columns || item?.flexColumns || []
    if (Array.isArray(cols)) {
      for (const col of cols) {
        const runs = col?.title?.runs || col?.text?.runs || col?.runs
        if (Array.isArray(runs)) {
          const list = extractFromRuns(runs)
          if (list.length > 0) {
            artists.push(...list)
            break
          }
        }
      }
    }
  }

  // 4. subtitle runs
  if (artists.length === 0 && item?.subtitle?.runs && Array.isArray(item.subtitle.runs)) {
    const list = extractFromRuns(item.subtitle.runs)
    if (list.length > 0) {
      artists.push(...list)
    }
  }

  // 5. byline / long_byline_text / short_byline_text runs
  if (artists.length === 0) {
    const bylineObj = item?.byline || item?.long_byline_text || item?.short_byline_text || item?.runs
    const runs = Array.isArray(bylineObj) ? bylineObj : bylineObj?.runs
    if (Array.isArray(runs)) {
      const list = extractFromRuns(runs)
      if (list.length > 0) {
        artists.push(...list)
      }
    }
  }

  // 6. Direct author single field
  if (artists.length === 0 && item?.author) {
    if (typeof item.author === 'string') {
      const name = safeText(item.author, '').trim()
      if (name) artists.push({ name, artistId: item.channel_id || null })
    } else {
      const name = safeText(item.author.name || item.author.text || item.author, '').trim()
      if (name) {
        artists.push({
          name,
          artistId: item.author.channel_id || item.author.endpoint?.payload?.browseId || item.channel_id || null
        })
      }
    }
  }

  // 7. Subtitle plain string fallback (split by comma/& if there's no bullet)
  if (artists.length === 0 && item?.subtitle) {
    const subStr = typeof item.subtitle === 'string' ? item.subtitle : safeText(item.subtitle.text || item.subtitle, '')
    if (subStr && subStr !== 'Unknown') {
      // Split by bullet first, take the first part (artist part)
      const artistPart = subStr.split(/[•·\u2022\u00b7]/)[0]?.trim()
      if (artistPart) {
        // Split by standard list separators like comma, &, and, feat.
        const parts = artistPart.split(/,|\s+&\s+|\s+and\s+|\s+feat\.?\s+|\s+featuring\s+/i).map((p: string) => p.trim()).filter(Boolean)
        for (const part of parts) {
          const lower = part.toLowerCase()
          if (
            lower !== 'song' &&
            lower !== 'video' &&
            lower !== 'album' &&
            lower !== 'single' &&
            !/^\d+:\d+$/.test(part) &&
            !/^\d{4}$/.test(part) &&
            part !== safeText(item?.title, '').trim()
          ) {
            artists.push({ name: part, artistId: null })
          }
        }
      }
    }
  }

  // 8. Fallback to fallbackArtist
  if (artists.length === 0 && fallbackArtist?.name) {
    artists.push(fallbackArtist)
  }

  // Final cleanup: filter out duplicates and empty entries
  const unique: ArtistBasic[] = []
  const seenNames = new Set<string>()
  for (const a of artists) {
    const trimmedName = a.name.trim()
    if (!trimmedName || trimmedName === 'Unknown' || trimmedName === 'Unknown Artist') continue
    const lowerName = trimmedName.toLowerCase()
    if (!seenNames.has(lowerName)) {
      seenNames.add(lowerName)
      unique.push({ name: trimmedName, artistId: a.artistId })
    }
  }

  if (unique.length === 0) {
    unique.push({ name: 'Unknown Artist', artistId: null })
  }

  return unique
}

/** Stress probe artist page header across all possible inner object structures. */
export function extractArtistHeaderInfo(resp: any, fallbackId?: string): { name: string; artistId: string | null; thumbnails: Thumbnail[]; subscribers?: string } {
  let name = ''
  let artistId: string | null = fallbackId || null
  let thumbnails: Thumbnail[] = []
  let subscribers: string | undefined

  const header = resp?.header
  if (header) {
    name = safeText(header.title || header.musicImmersiveHeader?.title || header.musicVisualHeader?.title || header.musicHeader?.title, '')
    thumbnails = extractThumbnails(header)
    subscribers = safeText(header.subscribers || header.musicImmersiveHeader?.subscribers || header.musicVisualHeader?.subscribers, '') || undefined
  }

  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    name = safeText(resp?.title || resp?.name || resp?.metadata?.title || resp?.header?.title || '', '')
  }

  if (thumbnails.length === 0) {
    thumbnails = extractThumbnails(resp)
  }

  if (!name || name === 'Unknown' || name === 'Unknown Artist') {
    if (resp?.sections && Array.isArray(resp.sections)) {
      for (const s of resp.sections) {
        if (s?.contents && Array.isArray(s.contents) && s.contents.length > 0) {
          const firstTrack = mapItemToTrack(s.contents[0]) || mapTwoRowToTrack(s.contents[0])
          if (firstTrack?.artist?.name && firstTrack.artist.name !== 'Unknown' && firstTrack.artist.name !== 'Unknown Artist') {
            name = firstTrack.artist.name
            if (firstTrack.artist.artistId) artistId = firstTrack.artist.artistId
            break
          }
        }
      }
    }
  }

  if (!name || name.trim() === '') {
    name = 'Unknown Artist'
  }

  return { name, artistId, thumbnails, subscribers }
}

// ── Video ID extraction ──────────────────────────────────────────

/** Regex for a valid YouTube video ID: exactly 11 chars of [A-Za-z0-9_-]. */
const VALID_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * Extract the real watchable video ID from a youtubei.js item.
 *
 * MusicResponsiveListItem.id sometimes returns a content/browse hash
 * (e.g. 52-char `VLRDCLAK5uy_...`) instead of the 11-char video ID.
 * The actual video ID lives in the navigation endpoint payload.
 * Only fall back to item.id when it looks like a valid video ID.
 */
function extractVideoId(item: any): string {
  // Prefer the watch endpoint — this always has the real video ID
  const fromEndpoint =
    item.endpoint?.payload?.videoId ||
    item.on_tap?.payload?.videoId ||
    item.on_tap?.payload?.watchEndpoint?.videoId ||
    ''
  if (fromEndpoint) return fromEndpoint

  // Fallback to item.id only if it's a valid 11-char video ID
  const rawId = item.id || ''
  if (rawId && VALID_VIDEO_ID_RE.test(rawId)) return rawId

  return ''
}

// ── Duration parsing ──────────────────────────────────────────────

/** Parse a duration string like "3:45" or "1:02:30" into seconds. */
export function parseDurationStr(time: string | number | null | undefined): number | null {
  if (time == null) return null
  if (typeof time === 'number') return time
  const parts = String(time).split(':').reverse().map(n => +n)
  if (parts.some(isNaN)) return null
  return (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600
}

// ── Thumbnail helpers ─────────────────────────────────────────────

/**
 * Recursively and universally extract thumbnails from any youtubei.js node, item, or header.
 *
 * youtubei.js wraps thumbnails in various shapes depending on the endpoint and item structure:
 *  - MusicResponsiveListItem has `.thumbnails` getter or `.thumbnail` (MusicThumbnail with `.contents`)
 *  - MusicTwoRowItem / PlaylistPanelVideo have `.thumbnail` as `Thumbnail[]` or `MusicThumbnail`
 *  - MusicDetailHeader has `.thumbnails: Thumbnail[]`
 *  - MusicResponsiveHeader has `.thumbnail: MusicThumbnail` and `.strapline_thumbnail: MusicThumbnail`
 *  - MusicImmersiveHeader has `.thumbnail: MusicThumbnail`
 *  - MusicVisualHeader has `.thumbnail: Thumbnail[]` and `.foreground_thumbnail: Thumbnail[]`
 *  - Album / Playlist detail objects have `.header` and `.background` (MusicThumbnail)
 */
export function extractThumbnails(source: any, visited = new WeakSet()): Thumbnail[] {
  if (!source || typeof source !== 'object') return []
  if (visited.has(source)) return []
  visited.add(source)

  // 1. Direct array of objects or strings
  if (Array.isArray(source)) {
    const results: Thumbnail[] = []
    for (const item of source) {
      if (item && typeof item === 'object') {
        if (typeof item.url === 'string') {
          results.push({
            url: item.url,
            width: typeof item.width === 'number' ? item.width : (typeof item.url_width === 'number' ? item.url_width : 480),
            height: typeof item.height === 'number' ? item.height : (typeof item.url_height === 'number' ? item.url_height : 360)
          })
        } else {
          results.push(...extractThumbnails(item, visited))
        }
      } else if (typeof item === 'string' && item.startsWith('http')) {
        results.push({ url: item, width: 480, height: 360 })
      }
    }
    return results
  }

  // 2. Direct Thumbnail object
  if (typeof source.url === 'string') {
    return [{
      url: source.url,
      width: typeof source.width === 'number' ? source.width : (typeof source.url_width === 'number' ? source.url_width : 480),
      height: typeof source.height === 'number' ? source.height : (typeof source.url_height === 'number' ? source.url_height : 360)
    }]
  }

  const results: Thumbnail[] = []

  // Helper to extract from a property if present
  const checkProp = (prop: any) => {
    if (prop && prop !== source) {
      results.push(...extractThumbnails(prop, visited))
    }
  }

  // Check known thumbnail properties
  // Prefer getter .thumbnails or .thumbnail property
  if ('thumbnails' in source && source.thumbnails !== source) {
    checkProp(source.thumbnails)
  }
  if ('thumbnail' in source && source.thumbnail !== source) {
    checkProp(source.thumbnail)
  }

  // Check header property (often on Album / Playlist / Artist response objects)
  if ('header' in source && source.header !== source) {
    checkProp(source.header)
  }

  // Check specialized header/item cover art properties
  if ('background' in source) checkProp(source.background)
  if ('foreground_thumbnail' in source) checkProp(source.foreground_thumbnail)
  if ('strapline_thumbnail' in source) checkProp(source.strapline_thumbnail)
  if ('thumbnail_renderer' in source) checkProp(source.thumbnail_renderer)
  if ('music_thumbnail_renderer' in source) checkProp(source.music_thumbnail_renderer)

  // Check contents ONLY IF this object is a thumbnail wrapper class or object
  // (Do NOT check contents if this is a track list container like Album, Playlist, or HomeSection)
  if (
    source.type === 'MusicThumbnail' ||
    source.type === 'Thumbnail' ||
    source.constructor?.name === 'MusicThumbnail' ||
    source.constructor?.name === 'Thumbnail' ||
    ('contents' in source && Array.isArray(source.contents) && source.contents.length > 0 && typeof source.contents[0]?.url === 'string')
  ) {
    checkProp(source.contents)
  }

  return results
}

/** Extract thumbnails from a raw array into Hyro's Thumbnail[]. Kept for backward compatibility. */
function mapThumbnails(raw: any[]): Thumbnail[] {
  return extractThumbnails(raw)
}

// ── MusicResponsiveListItem mappers ───────────────────────────────

/** Check if a MusicResponsiveListItem is a song. */
export function isSongItem(item: any): boolean {
  return item.item_type === 'song' || item.item_type === 'video'
}

/** Check if a MusicResponsiveListItem is an album. */
export function isAlbumItem(item: any): boolean {
  return item.item_type === 'album'
}

/** Check if a MusicResponsiveListItem is an artist. */
export function isArtistItem(item: any): boolean {
  return item.item_type === 'artist' || item.item_type === 'library_artist'
}

/** Check if a MusicResponsiveListItem is a playlist. */
export function isPlaylistItem(item: any): boolean {
  return item.item_type === 'playlist'
}

/** Map a MusicResponsiveListItem (song/video) to a Track. */
export function mapItemToTrack(item: any, fallbackArtist?: ArtistBasic): Track | null {
  if (!item || (item.item_type !== 'song' && item.item_type !== 'video')) return null

  const videoId = extractVideoId(item)
  if (!videoId) return null

  // Extract artist info
  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }

  // Extract album info
  let album: AlbumBasic | null = null
  if (item.album) {
    album = {
      albumId: item.album.id || '',
      name: safeText(item.album.name, '')
    }
  }

  // Extract duration
  const duration = item.duration?.seconds || parseDurationStr(item.duration?.text) || null

  // Extract thumbnails
  const thumbnails = extractThumbnails(item)

  // Determine type
  const type: 'SONG' | 'VIDEO' = item.item_type === 'video' ? 'VIDEO' : 'SONG'

  return {
    videoId,
    name: safeText(item.title),
    artist,
    artists,
    album,
    duration,
    thumbnails,
    type
  }
}

/** Map a MusicResponsiveListItem (album) to an Album. */
export function mapItemToAlbum(item: any, fallbackArtist?: ArtistBasic): Album | null {
  if (!item || item.item_type !== 'album') return null

  const albumId = item.id || item.endpoint?.payload?.browseId || ''
  if (!albumId) return null

  // Extract artist
  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }

  // Extract playlistId from album browse endpoint
  const playlistId = item.endpoint?.payload?.browseId || albumId

  // Parse year
  const year = item.year ? parseInt(item.year, 10) || null : null

  const thumbnails = extractThumbnails(item)

  return {
    albumId,
    playlistId,
    name: safeText(item.title),
    artist,
    artists,
    year,
    thumbnails,
    type: 'ALBUM'
  }
}

/** Map a MusicResponsiveListItem (artist) to an Artist. */
export function mapItemToArtist(item: any): Artist | null {
  if (!item || (item.item_type !== 'artist' && item.item_type !== 'library_artist')) return null

  const artistId = item.id || item.endpoint?.payload?.browseId || ''
  if (!artistId) return null

  const thumbnails = extractThumbnails(item)

  return {
    artistId,
    name: safeText(item.title) !== 'Unknown' ? safeText(item.title) : safeText(item.name),
    thumbnails,
    type: 'ARTIST',
    subscribers: safeText(item.subscribers, '') || undefined
  }
}

/** Map a MusicResponsiveListItem (playlist) to a Playlist. */
export function mapItemToPlaylist(item: any): Playlist | null {
  if (!item || item.item_type !== 'playlist') return null

  const playlistId = item.id || item.endpoint?.payload?.browseId || ''
  if (!playlistId) return null

  // Extract owner/artist
  const artists = extractArtistsFromItem(item)
  const artist = artists[0] || { artistId: null, name: 'Unknown' }

  const thumbnails = extractThumbnails(item)

  // Parse video count from item_count string like "50 songs"
  const videoCount = item.song_count
    ? parseInt(item.song_count, 10) || undefined
    : item.item_count
      ? parseInt(item.item_count, 10) || undefined
      : undefined

  return {
    playlistId,
    name: safeText(item.title),
    artist,
    artists,
    thumbnails,
    type: 'PLAYLIST',
    videoCount
  }
}

// ── MusicTwoRowItem mappers (used in home feed, search shelves) ───

/** Map a MusicTwoRowItem to a Track. */
export function mapTwoRowToTrack(item: any, fallbackArtist?: ArtistBasic): Track | null {
  if (!item || (item.item_type && item.item_type !== 'song' && item.item_type !== 'video')) return null

  const videoId = extractVideoId(item)
  if (!videoId) return null
  const title = safeText(item.title)

  // Extract artist
  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }

  const thumbnails = extractThumbnails(item)

  return {
    videoId,
    name: title,
    artist,
    artists,
    album: null,
    duration: null,
    thumbnails,
    type: item.item_type === 'video' ? 'VIDEO' : 'SONG'
  }
}

/** Map a MusicTwoRowItem to an Album. */
export function mapTwoRowToAlbum(item: any, fallbackArtist?: ArtistBasic): Album | null {
  if (!item || !item.id || (item.item_type && item.item_type !== 'album' && !item.id.startsWith('MPRE'))) return null

  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }

  const thumbnails = extractThumbnails(item)
  const year = item.year ? parseInt(item.year, 10) || null : null

  return {
    albumId: item.id,
    playlistId: item.id,
    name: safeText(item.title),
    artist,
    artists,
    year,
    thumbnails,
    type: 'ALBUM'
  }
}

/** Map a MusicTwoRowItem to a Playlist. */
export function mapTwoRowToPlaylist(item: any): Playlist | null {
  if (!item || !item.id || (item.item_type && item.item_type !== 'playlist' && !item.id.startsWith('VL') && !item.id.startsWith('PL'))) return null

  const artists = extractArtistsFromItem(item)
  const artist = artists[0] || { artistId: null, name: 'Unknown' }

  const thumbnails = extractThumbnails(item)

  return {
    playlistId: item.id,
    name: safeText(item.title),
    artist,
    artists,
    thumbnails,
    type: 'PLAYLIST'
  }
}

/** Map a MusicTwoRowItem (or similar node) to an Artist. */
export function mapTwoRowToArtist(item: any): Artist | null {
  if (!item) return null
  const artistId = item.id || item.endpoint?.payload?.browseId || ''
  if (!artistId || (!artistId.startsWith('UC') && !artistId.startsWith('FEmusic_library_privately_owned_artist') && item.item_type !== 'artist' && item.item_type !== 'library_artist')) return null

  const thumbnails = extractThumbnails(item)

  return {
    artistId,
    name: safeText(item.title) !== 'Unknown' ? safeText(item.title) : safeText(item.name),
    thumbnails,
    type: 'ARTIST',
    subscribers: safeText(item.subscribers, '') || undefined
  }
}

// ── MusicCardShelf mappers (Top Result cards) ──────────────────────

/** Map a MusicCardShelf to a Track. */
export function mapCardShelfToTrack(item: any, fallbackArtist?: ArtistBasic): Track | null {
  if (!item || (item.type !== 'MusicCardShelf' && item.constructor?.name !== 'MusicCardShelf')) return null
  const videoId = item.on_tap?.payload?.videoId || item.on_tap?.payload?.watchEndpoint?.videoId || ''
  if (!videoId) return null

  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }
  let duration: number | null = null
  if (item.subtitle?.runs && Array.isArray(item.subtitle.runs)) {
    const lastRunText = item.subtitle.runs[item.subtitle.runs.length - 1]?.text || ''
    duration = parseDurationStr(lastRunText)
  } else if (typeof item.subtitle === 'string' || item.subtitle?.text) {
    const parts = (typeof item.subtitle === 'string' ? item.subtitle : item.subtitle.text).split(' • ')
    if (parts.length >= 3) duration = parseDurationStr(parts[parts.length - 1])
  }

  const thumbnails = extractThumbnails(item)
  const subtitleStr = (item.subtitle?.toString() || '').toLowerCase()
  const type: 'SONG' | 'VIDEO' = subtitleStr.startsWith('video') ? 'VIDEO' : 'SONG'

  return {
    videoId,
    name: safeText(item.title),
    artist,
    artists,
    album: null,
    duration,
    thumbnails,
    type
  }
}

/** Map a MusicCardShelf to an Album. */
export function mapCardShelfToAlbum(item: any, fallbackArtist?: ArtistBasic): Album | null {
  if (!item || (item.type !== 'MusicCardShelf' && item.constructor?.name !== 'MusicCardShelf')) return null
  const browseId = item.on_tap?.payload?.browseId || ''
  const subtitleStr = (item.subtitle?.toString() || '').toLowerCase()
  if (!browseId.startsWith('MPRE') && !subtitleStr.startsWith('album')) return null

  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }
  let year: number | null = null
  if (item.subtitle?.runs && Array.isArray(item.subtitle.runs)) {
    for (const run of item.subtitle.runs) {
      if (run?.text && /^\d{4}$/.test(run.text)) {
        year = parseInt(run.text, 10)
      }
    }
  } else if (typeof item.subtitle === 'string' || item.subtitle?.text) {
    const parts = (typeof item.subtitle === 'string' ? item.subtitle : item.subtitle.text).split(' • ')
    if (parts.length >= 3 && /^\d{4}$/.test(parts[2])) year = parseInt(parts[2], 10)
  }

  const thumbnails = extractThumbnails(item)

  return {
    albumId: browseId,
    playlistId: browseId,
    name: safeText(item.title),
    artist,
    artists,
    year,
    thumbnails,
    type: 'ALBUM'
  }
}

/** Map a MusicCardShelf to an Artist. */
export function mapCardShelfToArtist(item: any): Artist | null {
  if (!item || (item.type !== 'MusicCardShelf' && item.constructor?.name !== 'MusicCardShelf')) return null
  const browseId = item.on_tap?.payload?.browseId || ''
  const subtitleStr = (item.subtitle?.toString() || '').toLowerCase()
  if (!browseId.startsWith('UC') && !browseId.startsWith('FEmusic_library_privately_owned_artist') && !subtitleStr.startsWith('artist')) return null

  const thumbnails = extractThumbnails(item)

  return {
    artistId: browseId,
    name: safeText(item.title),
    thumbnails,
    type: 'ARTIST',
    subscribers: typeof item.subtitle === 'string' ? item.subtitle : item.subtitle?.text
  }
}

/** Map a MusicCardShelf to a Playlist. */
export function mapCardShelfToPlaylist(item: any, fallbackArtist?: ArtistBasic): Playlist | null {
  if (!item || (item.type !== 'MusicCardShelf' && item.constructor?.name !== 'MusicCardShelf')) return null
  const browseId = item.on_tap?.payload?.browseId || ''
  const subtitleStr = (item.subtitle?.toString() || '').toLowerCase()
  if (!browseId.startsWith('VL') && !browseId.startsWith('PL') && !subtitleStr.startsWith('playlist')) return null

  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { artistId: null, name: 'Unknown' }
  const thumbnails = extractThumbnails(item)

  return {
    playlistId: browseId,
    name: safeText(item.title),
    artist,
    artists,
    thumbnails,
    type: 'PLAYLIST'
  }
}

// ── Universal item dispatcher ─────────────────────────────────────

export function tryMapToTrack(item: any, fallbackArtist?: ArtistBasic): Track | null {
  return mapItemToTrack(item, fallbackArtist) || mapTwoRowToTrack(item, fallbackArtist) || mapMultiRowToTrack(item, fallbackArtist) || mapCardShelfToTrack(item, fallbackArtist)
}

function tryMapToAlbum(item: any, fallbackArtist?: ArtistBasic): Album | null {
  return mapItemToAlbum(item, fallbackArtist) || mapTwoRowToAlbum(item, fallbackArtist) || mapCardShelfToAlbum(item)
}

function tryMapToArtist(item: any): Artist | null {
  return mapItemToArtist(item) || mapTwoRowToArtist(item) || mapCardShelfToArtist(item)
}

function tryMapToPlaylist(item: any): Playlist | null {
  return mapItemToPlaylist(item) || mapTwoRowToPlaylist(item) || mapCardShelfToPlaylist(item)
}

// ── Search results mapper ─────────────────────────────────────────

/** Map youtubei.js Music search results to Hyro's SearchResults. */
export function mapSearchResults(search: any): SearchResults {
  const songs: Track[] = []
  const albums: Album[] = []
  const artists: Artist[] = []
  const playlists: Playlist[] = []

  const seenSongIds = new Set<string>()
  const seenAlbumIds = new Set<string>()
  const seenArtistIds = new Set<string>()
  const seenPlaylistIds = new Set<string>()

  const addSong = (t: Track | null) => {
    if (t && t.videoId && !seenSongIds.has(t.videoId)) {
      seenSongIds.add(t.videoId)
      songs.push(t)
    }
  }
  const addAlbum = (a: Album | null) => {
    if (a && a.albumId && !seenAlbumIds.has(a.albumId)) {
      seenAlbumIds.add(a.albumId)
      albums.push(a)
    }
  }
  const addArtist = (ar: Artist | null) => {
    if (ar && ar.artistId && !seenArtistIds.has(ar.artistId)) {
      seenArtistIds.add(ar.artistId)
      artists.push(ar)
    }
  }
  const addPlaylist = (p: Playlist | null) => {
    if (p && p.playlistId && !seenPlaylistIds.has(p.playlistId)) {
      seenPlaylistIds.add(p.playlistId)
      playlists.push(p)
    }
  }

  // 1. Extract from built-in shelves (if populated)
  if (search.songs?.contents) {
    for (const item of search.songs.contents) addSong(tryMapToTrack(item))
  }
  if (search.videos?.contents) {
    for (const item of search.videos.contents) addSong(tryMapToTrack(item))
  }
  if (search.albums?.contents) {
    for (const item of search.albums.contents) addAlbum(tryMapToAlbum(item))
  }
  if (search.artists?.contents) {
    for (const item of search.artists.contents) addArtist(tryMapToArtist(item))
  }
  if (search.playlists?.contents) {
    for (const item of search.playlists.contents) addPlaylist(tryMapToPlaylist(item))
  }

  // 2. Extract universally across search.contents (handles Top Result cards, ItemSection lists, and any MusicShelf)
  if (search.contents && Array.isArray(search.contents)) {
    for (const section of search.contents) {
      if (!section || typeof section !== 'object') continue

      const sectionTitle = safeText(section.title, '').toLowerCase()
      const sectionType = section.type || section.constructor?.name || ''

      // Handle Top Result card shelf
      if (sectionType === 'MusicCardShelf') {
        addSong(mapCardShelfToTrack(section))
        addAlbum(mapCardShelfToAlbum(section))
        addArtist(mapCardShelfToArtist(section))
        addPlaylist(mapCardShelfToPlaylist(section))
      }

      // Handle nested items inside ItemSection, MusicShelf, or MusicCardShelf
      if (section.contents && Array.isArray(section.contents)) {
        for (const item of section.contents) {
          if (!item || typeof item !== 'object') continue

          const itemType = item.item_type || ''
          const endpoint = item.endpoint?.payload || item.on_tap?.payload || {}
          const browseId = endpoint.browseId || item.id || ''
          const videoId = endpoint.videoId || ''

          // Categorize by item_type, shelf hint, or navigation endpoint
          if (
            itemType === 'song' ||
            itemType === 'video' ||
            (/song|video/i.test(sectionTitle) && !itemType) ||
            (videoId && !browseId.startsWith('MPRE') && !browseId.startsWith('VL') && !browseId.startsWith('PL') && !browseId.startsWith('UC'))
          ) {
            addSong(tryMapToTrack(item))
          }

          if (
            itemType === 'album' ||
            /album|single|ep/i.test(sectionTitle) ||
            browseId.startsWith('MPRE')
          ) {
            addAlbum(tryMapToAlbum(item))
          }

          if (
            itemType === 'artist' ||
            itemType === 'library_artist' ||
            /artist/i.test(sectionTitle) ||
            browseId.startsWith('UC') ||
            browseId.startsWith('FEmusic_library_privately_owned_artist')
          ) {
            addArtist(tryMapToArtist(item))
          }

          if (
            itemType === 'playlist' ||
            /playlist/i.test(sectionTitle) ||
            browseId.startsWith('VL') ||
            browseId.startsWith('PL')
          ) {
            addPlaylist(tryMapToPlaylist(item))
          }
        }
      }
    }
  }

  return { songs, artists, albums, playlists }
}

// ── MusicMultiRowListItem mappers ────────────────────────────────

/** Map a MusicMultiRowListItem to a Track. */
export function mapMultiRowToTrack(item: any, fallbackArtist?: ArtistBasic): Track | null {
  if (!item || item.type !== 'MusicMultiRowListItem') return null

  const videoId = item.on_tap?.payload?.videoId || item.on_tap?.payload?.watchEndpoint?.videoId || ''
  if (!videoId) return null

  const title = safeText(item.title)
  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }
  const thumbnails = extractThumbnails(item)


  return {
    videoId,
    name: title,
    artist,
    artists,
    album: null,
    duration: null,
    thumbnails,
    type: 'SONG'
  }
}

/** Map a MusicMultiRowListItem to an Album. */
export function mapMultiRowToAlbum(item: any, fallbackArtist?: ArtistBasic): Album | null {
  if (!item || item.type !== 'MusicMultiRowListItem') return null

  const albumId = item.on_tap?.payload?.browseId || ''
  if (!albumId) return null

  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { name: 'Unknown Artist', artistId: null }
  const thumbnails = extractThumbnails(item)

  return {
    albumId,
    playlistId: albumId,
    name: item.title?.text || 'Unknown',
    artist,
    artists,
    year: null,
    thumbnails,
    type: 'ALBUM'
  }
}

/** Map a MusicMultiRowListItem to a Playlist. */
export function mapMultiRowToPlaylist(item: any, fallbackArtist?: ArtistBasic): Playlist | null {
  if (!item || item.type !== 'MusicMultiRowListItem') return null

  const playlistId = item.on_tap?.payload?.browseId || ''
  if (!playlistId) return null

  const artists = extractArtistsFromItem(item, fallbackArtist)
  const artist = artists[0] || { artistId: null, name: 'Unknown' }
  const thumbnails = extractThumbnails(item)

  return {
    playlistId,
    name: item.title?.text || 'Unknown',
    artist,
    artists,
    thumbnails,
    type: 'PLAYLIST'
  }
}

// ── Home feed mapper ──────────────────────────────────────────────

/** Map youtubei.js Music home feed to Hyro's HomeSection[]. */
export function mapHomeFeed(homeFeed: any): HomeSection[] {
  const sections: HomeSection[] = []

  // HomeFeed exposes `sections` (MusicCarouselShelf[]), not `contents`
  const shelves = homeFeed?.sections
  if (!shelves || !shelves.length) return sections

  for (const shelf of shelves) {
    // MusicCarouselShelfBasicHeader has a `title` Text object
    const title = shelf.header?.title?.text || ''
    const contents: (Track | Album | Playlist)[] = []

    if (shelf.contents) {
      for (const item of shelf.contents) {
        // Try as song (MusicResponsiveListItem)
        const track = mapItemToTrack(item)
        if (track) {
          contents.push(track)
          continue
        }

        // Try as song (MusicTwoRowItem — used in home feed shelves)
        const twoRowTrack = mapTwoRowToTrack(item)
        if (twoRowTrack) {
          contents.push(twoRowTrack)
          continue
        }

        // Try as song (MusicMultiRowListItem — newer home feed format)
        const multiRowTrack = mapMultiRowToTrack(item)
        if (multiRowTrack) {
          contents.push(multiRowTrack)
          continue
        }

        // Try as album
        const album = mapItemToAlbum(item) || mapTwoRowToAlbum(item) || mapMultiRowToAlbum(item)
        if (album) {
          contents.push(album)
          continue
        }

        // Try as playlist
        const playlist = mapItemToPlaylist(item) || mapTwoRowToPlaylist(item) || mapMultiRowToPlaylist(item)
        if (playlist) {
          contents.push(playlist)
          continue
        }
      }
    }

    if (contents.length > 0) {
      sections.push({ title, contents })
    }
  }

  return sections
}

// ── Album detail mapper ───────────────────────────────────────────

/** Map youtubei.js Music album response to Hyro's Album with songs. */
export function mapAlbumDetail(albumResponse: any, albumId: string): Album {
  // Extract header info
  const header = albumResponse.header
  let name = 'Unknown'
  let artist: ArtistBasic = { artistId: null, name: 'Unknown' }
  let year: number | null = null
  let thumbnails: Thumbnail[] = []

  if (header) {
    name = safeText(header.title)

    if (header.artist) {
      artist = {
        artistId: header.artist.endpoint?.payload?.browseId || null,
        name: safeText(header.artist.name)
      }
    } else if (header.authors && header.authors.length > 0) {
      artist = {
        artistId: header.authors[0].endpoint?.payload?.browseId || null,
        name: safeText(header.authors[0].name)
      }
    }

    if (header.year) {
      year = parseInt(header.year, 10) || null
    }

    thumbnails = extractThumbnails(header)
  }

  if (thumbnails.length === 0 && albumResponse.background) {
    thumbnails = extractThumbnails(albumResponse.background)
  }
  if (thumbnails.length === 0) {
    thumbnails = extractThumbnails(albumResponse)
  }

  // Extract songs
  const songs: Track[] = []
  if (albumResponse.contents) {
    for (const item of albumResponse.contents) {
      const track = mapItemToTrack(item, artist) || mapTwoRowToTrack(item, artist)
      if (track) {
        // Ensure album info and fallback thumbnails are set on each track
        if (!track.album) {
          track.album = { albumId, name }
        }
        if (track.artist.name === 'Unknown' || track.artist.name === 'Unknown Artist') {
          track.artist = artist
        }
        if (track.thumbnails.length === 0 && thumbnails.length > 0) {
          track.thumbnails = thumbnails
        }
        songs.push(track)
      }
    }
  }

  // Try to extract playlistId from the album's browse endpoint
  const playlistId = albumId

  return {
    albumId,
    playlistId,
    name,
    artist,
    year,
    thumbnails,
    type: 'ALBUM',
    songs
  }
}

// ── Playlist detail mapper ────────────────────────────────────────

/** Map youtubei.js Music playlist response to Hyro's Playlist with videos. */
export function mapPlaylistDetail(playlistResponse: any, playlistId: string): Playlist {
  const header = playlistResponse.header
  let name = 'Unknown'
  let artist: ArtistBasic = { artistId: null, name: 'Unknown' }
  let thumbnails: Thumbnail[] = []
  let videoCount: number | undefined

  if (header) {
    name = safeText(header.title)

    if (header.author) {
      artist = {
        artistId: header.author.endpoint?.payload?.browseId || null,
        name: safeText(header.author.name)
      }
    } else if (header.authors && header.authors.length > 0) {
      artist = {
        artistId: header.authors[0].endpoint?.payload?.browseId || null,
        name: safeText(header.authors[0].name)
      }
    }

    thumbnails = extractThumbnails(header)

    if (header.item_count) {
      videoCount = parseInt(header.item_count, 10) || undefined
    }
  }

  if (thumbnails.length === 0 && playlistResponse.background) {
    thumbnails = extractThumbnails(playlistResponse.background)
  }
  if (thumbnails.length === 0) {
    thumbnails = extractThumbnails(playlistResponse)
  }

  // Extract videos safely from items, contents, or contents_memo getters
  const videos: Track[] = []
  const memoItems = [
    ...(Array.isArray(playlistResponse.items) ? playlistResponse.items : []),
    ...(Array.isArray(playlistResponse.contents) ? playlistResponse.contents : []),
    ...(Array.isArray(playlistResponse.contents_memo?.get('MusicResponsiveListItem'))
      ? playlistResponse.contents_memo.get('MusicResponsiveListItem')
      : []),
    ...(Array.isArray(playlistResponse.contents_memo?.get('MusicTwoRowItem'))
      ? playlistResponse.contents_memo.get('MusicTwoRowItem')
      : []),
    ...(Array.isArray(playlistResponse.contents_memo?.get('PlaylistPanelVideo'))
      ? playlistResponse.contents_memo.get('PlaylistPanelVideo')
      : [])
  ]

  const seenVideoIds = new Set<string>()
  for (const item of memoItems) {
    const track = mapItemToTrack(item, artist) || mapTwoRowToTrack(item, artist)
    if (track && track.videoId && !seenVideoIds.has(track.videoId)) {
      seenVideoIds.add(track.videoId)
      if (track.artist.name === 'Unknown' || track.artist.name === 'Unknown Artist') {
        track.artist = artist
      }
      if (track.thumbnails.length === 0 && thumbnails.length > 0) {
        track.thumbnails = thumbnails
      }
      videos.push(track)
    }
  }

  return {
    playlistId,
    name,
    artist,
    thumbnails,
    type: 'PLAYLIST',
    videoCount,
    videos
  }
}

// ── Artist detail mapper ──────────────────────────────────────────

/** Map youtubei.js Music artist response to Hyro's Artist. */
export async function mapArtistDetail(artistResponse: any, artistId: string, yt?: any): Promise<Artist> {
  const headerInfo = extractArtistHeaderInfo(artistResponse, artistId)
  const name = headerInfo.name
  let thumbnails = headerInfo.thumbnails
  const subscribers = headerInfo.subscribers
  const resolvedArtistId = headerInfo.artistId || artistId
  const headerArtist: ArtistBasic = { artistId: resolvedArtistId, name }

  // Extract songs, albums, and singles
  const songs: Track[] = []
  const albums: Album[] = []
  const singles: Album[] = []

  // Try fetching all songs via getAllSongs() if yt is passed
  if (yt && typeof artistResponse.getAllSongs === 'function') {
    try {
      const allSongsPage = await artistResponse.getAllSongs()
      const songItems = Array.isArray(allSongsPage?.contents) ? allSongsPage.contents : []
      if (songItems.length > 0) {
        const seenSongIds = new Set<string>()
        for (const item of songItems) {
          const track = mapItemToTrack(item, headerArtist) || mapTwoRowToTrack(item, headerArtist)
          if (track && !seenSongIds.has(track.videoId)) {
            seenSongIds.add(track.videoId)
            if (track.artist.name === 'Unknown' || track.artist.name === 'Unknown Artist') {
              track.artist = headerArtist
            }
            songs.push(track)
          }
        }
      }
    } catch (err) {
      console.warn(`[mapArtistDetail] getAllSongs failed for ${artistId}, falling back to section contents`)
    }
  }

  // If getAllSongs wasn't called or returned no songs, check section contents for Top songs
  if (songs.length === 0 && artistResponse.sections) {
    const seenSongIds = new Set<string>()
    for (const section of artistResponse.sections) {
      const sectionTitle = section.header?.title?.text || ''
      if (section.type === 'MusicShelf' || sectionTitle.toLowerCase().includes('song') || sectionTitle.toLowerCase().includes('hit')) {
        if (section.contents) {
          const sectionItems = Array.isArray(section.contents) ? section.contents : []
          for (const item of sectionItems) {
            const track = mapItemToTrack(item, headerArtist) || mapTwoRowToTrack(item, headerArtist)
            if (track && !seenSongIds.has(track.videoId)) {
              seenSongIds.add(track.videoId)
              if (track.artist.name === 'Unknown' || track.artist.name === 'Unknown Artist') {
                track.artist = headerArtist
              }
              songs.push(track)
            }
          }
        }
      }
    }
  }

  // Extract albums and singles with full expansion and pagination via more_content / endpoints
  if (artistResponse.sections) {
    for (const section of artistResponse.sections) {
      const sectionTitle = (
        section.header?.title?.text ||
        section.title?.text ||
        section.header?.strapline?.text ||
        ''
      ).toString()

      const isAlbums = sectionTitle.toLowerCase().includes('album')
      const isSingles = sectionTitle.toLowerCase().includes('single')

      if (!isAlbums && !isSingles) continue

      const targetList = isAlbums ? albums : singles
      const seenAlbumIds = new Set(targetList.map(a => a.albumId))
      const moreBtn =
        section.header?.more_content ||
        section.more_content ||
        (section as any).more_content_button ||
        section.header?.title?.endpoint ||
        section.title?.endpoint ||
        section.endpoint
      const endpoint = moreBtn?.endpoint || (moreBtn && typeof moreBtn.call === 'function' ? moreBtn : null)

      if (yt && endpoint?.call) {
        try {
          let page = await endpoint.call(yt.actions, { client: 'YTMUSIC', parse: true })
          let pageCount = 0
          while (page && pageCount < 10) {
            pageCount++
            const memoTwoRow = page.contents_memo?.get('MusicTwoRowItem')
            const memoResponsive = page.contents_memo?.get('MusicResponsiveListItem')
            const memoMultiRow = page.contents_memo?.get('MusicMultiRowListItem')

            const moreItems = [
              ...(Array.isArray(memoTwoRow) ? memoTwoRow : []),
              ...(Array.isArray(memoResponsive) ? memoResponsive : []),
              ...(Array.isArray(memoMultiRow) ? memoMultiRow : []),
              ...(Array.isArray(page.contents) ? page.contents : []),
              ...(Array.isArray(page.items) ? page.items : [])
            ]

            if (moreItems.length > 0) {
              for (const item of moreItems) {
                const album = mapItemToAlbum(item, headerArtist) || mapTwoRowToAlbum(item, headerArtist)
                if (album && album.albumId && !seenAlbumIds.has(album.albumId)) {
                  seenAlbumIds.add(album.albumId)
                  if (album.artist.name === 'Unknown' || album.artist.name === 'Unknown Artist') {
                    album.artist = headerArtist
                  }
                  targetList.push(album)
                }
              }
            }

            if (typeof page.getContinuation === 'function') {
              try {
                page = await page.getContinuation()
              } catch {
                break
              }
            } else if (page.continuation) {
              try {
                page = await yt.actions.execute(page.continuation, { client: 'YTMUSIC', parse: true })
              } catch {
                break
              }
            } else {
              break
            }
          }
        } catch (err) {
          console.warn(`[mapArtistDetail] Fetch more failed for section "${sectionTitle}", merging initial contents:`, err)
        }
      }

      // Merge initial contents from shelf safely
      if (section.contents) {
        const initialItems = Array.isArray(section.contents) ? section.contents : []
        for (const item of initialItems) {
          const album = mapItemToAlbum(item, headerArtist) || mapTwoRowToAlbum(item, headerArtist)
          if (album && album.albumId && !seenAlbumIds.has(album.albumId)) {
            seenAlbumIds.add(album.albumId)
            if (album.artist.name === 'Unknown' || album.artist.name === 'Unknown Artist') {
              album.artist = headerArtist
            }
            targetList.push(album)
          }
        }
      }
    }
  }

  return {
    artistId: resolvedArtistId,
    name,
    thumbnails,
    type: 'ARTIST',
    subscribers,
    songs,
    albums,
    singles
  }
}

// ── Up Next mapper ────────────────────────────────────────────────

/** Map youtubei.js up next (PlaylistPanel) tracks to Hyro's Track[]. */
export function mapUpNextTracks(playlistPanel: any): Track[] {
  const tracks: Track[] = []

  if (!playlistPanel?.contents) return tracks

  for (const item of playlistPanel.contents) {
    const track = mapItemToTrack(item)
    if (track) {
      tracks.push(track)
      continue
    }

    // Handle PlaylistPanelVideo nodes directly
    if (item && (item.type === 'PlaylistPanelVideo' || item.video_id)) {
      const videoId = item.video_id || extractVideoId(item)
      if (!videoId) continue

      const artists = extractArtistsFromItem(item)
      const artist = artists[0] || { name: 'Unknown Artist', artistId: null }

      let album: AlbumBasic | null = null
      if (item.album) {
        album = {
          albumId: item.album.id || '',
          name: safeText(item.album.name, '')
        }
      }

      const duration = item.duration?.seconds || parseDurationStr(item.duration?.text) || null
      const thumbnails = extractThumbnails(item)

      tracks.push({
        videoId,
        name: safeText(item.title),
        artist,
        artists,
        album,
        duration,
        thumbnails,
        type: 'SONG'
      })
    }
  }

  return tracks
}

