import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import YTMusic from 'ytmusic-api'
import { getGroqApiKey, getCookieBrowser } from './settings'
import { isVideoTitle } from '../../shared/video-keywords'
import { readLocalLyrics } from './download'
import { getInnertube, resetInnertube } from '../innertube/client'
import {
  mapSearchResults,
  mapHomeFeed,
  mapAlbumDetail,
  mapPlaylistDetail,
  mapArtistDetail,
  mapUpNextTracks,
  tryMapToTrack,
  parseDurationStr,
  extractThumbnails
} from '../innertube/helpers'

/**
 * Run an InnerTube operation with automatic retry on stale session errors.
 *
 * YouTube's InnerTube API intermittently returns empty/unparseable responses
 * when the session becomes stale (see youtubei.js#1158). The fix is to reset
 * the singleton instance and retry once with a fresh session before giving up.
 */
async function withInnertubeRetry<T>(
  label: string,
  fn: (yt: any) => Promise<T>
): Promise<T> {
  try {
    const yt = await getInnertube()
    return await fn(yt)
  } catch (err: any) {
    console.warn(`[innertube] ${label} failed on first attempt, resetting and retrying:`, err?.message || err)
    resetInnertube()
    await new Promise(resolve => setTimeout(resolve, 300))
    // Retry with a fresh instance — the caller will fall back to ytmusic-api if this also fails
    const yt = await getInnertube()
    return await fn(yt)
  }
}

const execFileAsync = promisify(execFile)

let ytmusic: YTMusic | null = null
let musixmatchToken: string | null = null

export async function initializeYTMusic(): Promise<void> {
  // ytmusic-api is now the fallback — initialize in background (non-blocking)
  // so it's ready if InnerTube fails. InnerTube is initialized lazily on first use.
  try {
    ytmusic = new YTMusic()
    await ytmusic.initialize()
    console.log('[ytmusic-api] Initialized (fallback ready)')
  } catch (err) {
    console.warn('[ytmusic-api] Initialization failed (fallback unavailable):', err)
  }
}

function getYTMusic(): YTMusic {
  if (!ytmusic) throw new Error('ytmusic-api not initialized')
  return ytmusic
}

/** Ensure playlist ID has the VL prefix required by the InnerTube browse endpoint. */
function toBrowsePlaylistId(playlistId: string): string {
  return playlistId.startsWith('VL') ? playlistId : 'VL' + playlistId
}

/** Strip the VL prefix to return the canonical playlist ID to the renderer. */
function fromBrowsePlaylistId(playlistId: string): string {
  return playlistId.startsWith('VL') ? playlistId.slice(2) : playlistId
}

export function registerMusicIPC(): void {
  ipcMain.handle('music:search', async (_event, query: string) => {
    // Primary: InnerTube (direct YouTube Music API) with stale-session retry
    try {
      const mapped = await withInnertubeRetry('search', async (yt) => {
        const results = await yt.music.search(query)
        return mapSearchResults(results)
      })
      // Filter out video-titled tracks
      mapped.songs = mapped.songs.filter((t) => !isVideoTitle(t.name))
      return mapped
    } catch (err) {
      console.warn('[search] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    const api = getYTMusic()
    const results = await api.search(query)

    const songs = results
      .filter((r: any) => r.type === 'SONG' || r.type === 'VIDEO')
      .filter((r: any) => !isVideoTitle(r.name))
      .map((r: any) => {
        const trackType: 'SONG' | 'VIDEO' = r.type === 'VIDEO' ? 'VIDEO' : 'SONG'
        return {
          videoId: r.videoId,
          name: r.name,
          artist: r.artist,
          album: r.album || null,
          duration: r.duration,
          thumbnails: r.thumbnails,
          type: trackType
        }
      })

    const artists = results
      .filter((r: any) => r.type === 'ARTIST')
      .map((r: any) => ({
        artistId: r.artistId,
        name: r.name,
        thumbnails: r.thumbnails,
        type: 'ARTIST' as const
      }))

    const albums = results
      .filter((r: any) => r.type === 'ALBUM')
      .map((r: any) => ({
        albumId: r.albumId,
        playlistId: r.playlistId,
        name: r.name,
        artist: r.artist,
        year: r.year,
        thumbnails: r.thumbnails,
        type: 'ALBUM' as const
      }))

    const playlists = results
      .filter((r: any) => r.type === 'PLAYLIST')
      .map((r: any) => ({
        playlistId: r.playlistId,
        name: r.name,
        artist: r.artist,
        thumbnails: r.thumbnails,
        type: 'PLAYLIST' as const
      }))

    return { songs, artists, albums, playlists }
  })

  ipcMain.handle('music:getHomeSections', async () => {
    // Primary: InnerTube with stale-session retry
    try {
      const sections = await withInnertubeRetry('getHomeSections', async (yt) => {
        const homeFeed = await yt.music.getHomeFeed()
        return mapHomeFeed(homeFeed)
      })
      // Filter out video-titled tracks
      return sections.map((section) => ({
        ...section,
        contents: section.contents.filter(
          (item) => item.type !== 'SONG' || !isVideoTitle(item.name)
        )
      }))
    } catch (err) {
      console.warn('[home] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    const api = getYTMusic()
    const sections = await api.getHomeSections()
    return sections.map((section: any) => ({
      title: section.title,
      contents: section.contents
        .filter((item: any) => item.type !== 'SONG' || !isVideoTitle(item.name))
        .map((item: any) => {
        if (item.type === 'SONG') {
          return {
            videoId: item.videoId,
            name: item.name,
            artist: item.artist,
            album: item.album || null,
            duration: item.duration,
            thumbnails: item.thumbnails,
            type: 'SONG' as const
          }
        }
        if (item.type === 'ALBUM') {
          return {
            albumId: item.albumId,
            playlistId: item.playlistId,
            name: item.name,
            artist: item.artist,
            year: item.year,
            thumbnails: item.thumbnails,
            type: 'ALBUM' as const
          }
        }
        if (item.type === 'PLAYLIST') {
          return {
            playlistId: item.playlistId,
            name: item.name,
            artist: item.artist,
            thumbnails: item.thumbnails,
            type: 'PLAYLIST' as const
          }
        }
        return item
      })
    }))
  })

  ipcMain.handle('music:getSong', async (_event, videoId: string) => {
    // Primary: InnerTube with stale-session retry
    try {
      return await withInnertubeRetry('getSong', async (yt) => {
        const info = await yt.music.getInfo(videoId)
        const basic = info.basic_info
        let thumbnails = extractThumbnails(basic.thumbnail)
        if (thumbnails.length === 0) thumbnails = extractThumbnails(basic)
        if (thumbnails.length === 0) thumbnails = extractThumbnails(info)
        return {
          videoId: basic.id || videoId,
          name: basic.title || 'Unknown',
          artist: {
            artistId: basic.channel?.id || (basic as any).channel_id || (info as any).channel_id || null,
            name: basic.channel?.name || (typeof basic.author === 'string' ? basic.author : basic.author?.name) || 'Unknown'
          },
          album: null,
          duration: basic.duration || null,
          thumbnails,
          type: 'SONG' as const,
          formats: (info as any).streaming_data?.formats || [],
          adaptiveFormats: (info as any).streaming_data?.adaptive_formats || []
        }
      })
    } catch (err) {
      console.warn('[getSong] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    const api = getYTMusic()
    const song = await api.getSong(videoId)
    return {
      videoId: song.videoId,
      name: song.name,
      artist: song.artist,
      album: (song as any).album || null,
      duration: song.duration,
      thumbnails: song.thumbnails,
      type: 'SONG' as const,
      formats: song.formats,
      adaptiveFormats: song.adaptiveFormats
    }
  })

  ipcMain.handle('music:getAlbum', async (_event, albumId: string) => {
    // Primary: InnerTube with stale-session retry
    try {
      return await withInnertubeRetry('getAlbum', async (yt) => {
        const albumResponse = await yt.music.getAlbum(albumId)
        return mapAlbumDetail(albumResponse, albumId)
      })
    } catch (err) {
      console.warn('[getAlbum] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    const api = getYTMusic()
    const album = await api.getAlbum(albumId)

    let songs = album.songs
    if (album.playlistId) {
      try {
        const browseId = toBrowsePlaylistId(album.playlistId)
        const playlistVideos = await api.getPlaylistVideos(browseId)
        if (playlistVideos.length > songs.length) {
          songs = playlistVideos.map((v: any) => ({
            videoId: v.videoId,
            name: v.name,
            artist: v.artist || album.artist,
            album: v.album || { albumId: album.albumId, name: album.name },
            duration: v.duration,
            thumbnails: album.thumbnails,
            type: 'SONG' as const
          }))
        }
      } catch {
        console.warn(`getPlaylistVideos failed for album ${albumId}, using getAlbum tracks`)
      }
    }

    return {
      albumId: album.albumId,
      playlistId: album.playlistId,
      name: album.name,
      artist: album.artist,
      year: album.year,
      thumbnails: album.thumbnails,
      type: 'ALBUM' as const,
      songs: songs.map((s: any) => ({
        videoId: s.videoId,
        name: s.name,
        artist: s.artist,
        album: s.album || null,
        duration: s.duration,
        thumbnails: s.thumbnails,
        type: 'SONG' as const
      }))
    }
  })

  ipcMain.handle('music:getPlaylist', async (_event, playlistId: string) => {
    const browseId = toBrowsePlaylistId(playlistId)

    // Primary: InnerTube with stale-session retry
    try {
      const res = await withInnertubeRetry('getPlaylist', async (yt) => {
        const playlistResponse = await yt.music.getPlaylist(browseId)
        return mapPlaylistDetail(playlistResponse, playlistId)
      })
      if (res && res.videos && res.videos.length > 0) {
        return res
      }
      console.warn(`[getPlaylist] InnerTube returned 0 videos for ${playlistId}, trying ytmusic-api fallback...`)
    } catch (err) {
      console.warn('[getPlaylist] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    try {
      const api = getYTMusic()
      const playlist = await api.getPlaylist(browseId)
      const videos = await api.getPlaylistVideos(browseId)
      return {
        playlistId: fromBrowsePlaylistId(playlist.playlistId || playlistId),
        name: playlist.name || 'Playlist',
        artist: playlist.artist || { artistId: null, name: 'Unknown' },
        thumbnails: playlist.thumbnails || [],
        type: 'PLAYLIST' as const,
        videoCount: playlist.videoCount || (videos ? videos.length : undefined),
        videos: (videos || []).map((v: any) => ({
          videoId: v.videoId,
          name: v.name,
          artist: v.artist || { artistId: null, name: 'Unknown' },
          album: v.album || null,
          duration: v.duration,
          thumbnails: v.thumbnails || playlist.thumbnails || [],
          type: 'SONG' as const
        }))
      }
    } catch (err) {
      console.error('[getPlaylist] Both InnerTube and ytmusic-api failed:', err)
      return {
        playlistId,
        name: 'Playlist',
        artist: { artistId: null, name: 'Unknown' },
        thumbnails: [],
        type: 'PLAYLIST' as const,
        videos: []
      }
    }
  })

  ipcMain.handle('music:getArtist', async (_event, artistId: string) => {
    // Primary: InnerTube with stale-session retry
    try {
      return await withInnertubeRetry('getArtist', async (yt) => {
        const artistResponse = await yt.music.getArtist(artistId)
        return mapArtistDetail(artistResponse, artistId, yt)
      })
    } catch (err) {
      console.warn('[getArtist] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    const api = getYTMusic()
    const artist = await api.getArtist(artistId)
    const headerArtist = { artistId: artist.artistId || artistId, name: artist.name || 'Unknown Artist' }
    return {
      artistId: artist.artistId,
      name: artist.name,
      thumbnails: artist.thumbnails,
      type: 'ARTIST' as const,
      subscribers: (artist as any).subscribers || null,
      songs: artist.topSongs.map((s) => ({
        videoId: s.videoId,
        name: s.name,
        artist: (!s.artist?.name || s.artist.name === 'Unknown') ? headerArtist : s.artist,
        album: s.album || null,
        duration: s.duration,
        thumbnails: s.thumbnails,
        type: 'SONG' as const
      })),
      albums: artist.topAlbums.map((a) => ({
        albumId: a.albumId,
        playlistId: a.playlistId,
        name: a.name,
        artist: (!a.artist?.name || a.artist.name === 'Unknown') ? headerArtist : a.artist,
        year: a.year,
        thumbnails: a.thumbnails,
        type: 'ALBUM' as const
      })),
      singles: (artist.topSingles || []).map((a) => ({
        albumId: a.albumId,
        playlistId: a.playlistId,
        name: a.name,
        artist: (!a.artist?.name || a.artist.name === 'Unknown') ? headerArtist : a.artist,
        year: a.year,
        thumbnails: a.thumbnails,
        type: 'ALBUM' as const
      }))
    }
  })

  ipcMain.handle('music:getUpNexts', async (_event, videoId: string) => {
    // Primary: InnerTube with stale-session retry
    try {
      const tracks = await withInnertubeRetry('getUpNexts', async (yt) => {
        let upNextTracks: any[] = []
        const seenIds = new Set<string>()

        try {
          const playlistPanel = await yt.music.getUpNext(videoId)
          const panelTracks = mapUpNextTracks(playlistPanel)
          for (const t of panelTracks) {
            if (t.videoId && !seenIds.has(t.videoId)) {
              seenIds.add(t.videoId)
              upNextTracks.push(t)
            }
          }
        } catch (err) {
          console.warn('[getUpNexts] yt.music.getUpNext failed:', err)
        }

        // Also fetch related / same genre recommendations ("You might also like", "Similar artists", etc.)
        try {
          const related = await yt.music.getRelated(videoId)
          if (related?.contents) {
            for (const shelf of related.contents) {
              const titleStr = String(shelf.title || shelf.header?.title?.text || '').toLowerCase()
              const isRecommendationShelf =
                titleStr.includes('might also like') ||
                titleStr.includes('recommended') ||
                titleStr.includes('similar') ||
                titleStr.includes('related') ||
                upNextTracks.length < 5

              if (isRecommendationShelf && shelf.contents) {
                for (const item of shelf.contents) {
                  const track = tryMapToTrack(item)
                  if (track && track.videoId && !seenIds.has(track.videoId)) {
                    seenIds.add(track.videoId)
                    upNextTracks.push(track)
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('[getUpNexts] yt.music.getRelated failed:', err)
        }

        return upNextTracks
      })
      if (tracks && tracks.length > 0) return tracks
    } catch (err) {
      console.warn('[getUpNexts] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    const api = getYTMusic()
    const upNexts = await api.getUpNexts(videoId)

    // Parse a duration string like "3:45" or "1:02:30" into seconds
    function parseDurationStr(time: string | number | null | undefined): number | null {
      if (time == null) return null
      if (typeof time === 'number') return time
      const parts = String(time).split(':').reverse().map(n => +n)
      if (parts.some(isNaN)) return null
      return (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600
    }

    // Build initial track list from the raw getUpNexts data
    const tracks = upNexts.map((item: any) => {
      // Normalize artist field — ytmusic-api uses "artists" (string or object) for getUpNexts
      // but "artist" (singular) for search/album/playlist. Handle all shapes.
      let artist = { artistId: null as string | null, name: 'Unknown' }
      const raw = item.artists || item.artist
      if (raw) {
        if (Array.isArray(raw) && raw.length > 0) {
          artist = { artistId: raw[0].artistId ?? null, name: raw[0].name || 'Unknown' }
        } else if (typeof raw === 'string') {
          artist = { artistId: null, name: raw }
        } else if (raw.name) {
          artist = { artistId: raw.artistId ?? null, name: raw.name }
        }
      }

      // Normalize thumbnails — ytmusic-api getUpNexts returns a single "thumbnail" URL string,
      // while other endpoints return "thumbnails" as an array of {url, width, height}.
      let thumbnails: { url: string; width: number; height: number }[] = []
      if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
        thumbnails = item.thumbnails
      } else if (item.thumbnail && typeof item.thumbnail === 'string') {
        // Single URL string from getUpNexts — wrap in standard Thumbnail shape
        thumbnails = [{ url: item.thumbnail, width: 480, height: 360 }]
      }

      // Normalize duration — getUpNexts returns a string like "3:45", other endpoints return a number
      const duration = parseDurationStr(item.duration)

      return {
        videoId: item.videoId,
        name: item.title || item.name || 'Unknown',
        artist,
        album: item.album || null,
        duration,
        thumbnails,
        type: 'SONG' as const
      }
    })

    // Resolve artistId for tracks that are missing it by fetching full song info.
    // getUpNexts returns artist names as plain strings without artistId, so we need
    // to look up each track via getSong to get the proper artist object.
    // Run in parallel with a concurrency limit to avoid hammering the API.
    const CONCURRENCY = 5
    const tracksNeedingResolve = tracks
      .map((t, i) => ({ track: t, index: i }))
      .filter(({ track }) => !track.artist.artistId)

    for (let i = 0; i < tracksNeedingResolve.length; i += CONCURRENCY) {
      const batch = tracksNeedingResolve.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(({ track }) => api.getSong(track.videoId))
      )
      for (let j = 0; j < batch.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          const song = result.value
          const resolvedTrack = tracks[batch[j].index]
          // Update artist with resolved data
          if (song.artist?.artistId) {
            resolvedTrack.artist = {
              artistId: song.artist.artistId,
              name: resolvedTrack.artist.name || song.artist.name
            }
          }
          // Also enrich thumbnails/duration if they were missing
          if (resolvedTrack.thumbnails.length === 0 && song.thumbnails?.length > 0) {
            resolvedTrack.thumbnails = song.thumbnails
          }
          if (!resolvedTrack.duration && song.duration) {
            resolvedTrack.duration = song.duration
          }
        }
        // On failure, keep the track as-is — artist name still shows, just not clickable
      }
    }

    return tracks
  })

  ipcMain.handle('music:getSearchSuggestions', async (_event, query: string) => {
    // Primary: InnerTube with stale-session retry
    try {
      const results = await withInnertubeRetry('getSearchSuggestions', async (yt) => {
        const suggestions = await yt.music.getSearchSuggestions(query)
        // youtubei.js returns ObservedArray<SearchSuggestionsSection>
        const output: string[] = []
        if (suggestions) {
          for (const section of suggestions) {
            if (section.contents) {
              for (const item of section.contents) {
                // SearchSuggestion has a `suggestion` property (Text object)
                // Use type assertion since YTNode base doesn't expose it
                const sugg = item as any
                if (sugg.suggestion?.text) {
                  output.push(sugg.suggestion.text)
                }
              }
            }
          }
        }
        return output
      })
      if (results.length > 0) return results
    } catch (err) {
      console.warn('[getSearchSuggestions] InnerTube failed (after retry), falling back to ytmusic-api:', err)
    }

    // Fallback: ytmusic-api
    const api = getYTMusic()
    return await api.getSearchSuggestions(query)
  })

  /**
   * Use Groq API to strip unnecessary metadata from track titles before querying
   * LRCLIB. YouTube titles often include things like "(Official Video)", "4K",
   * "[Official Music Video]", etc. which cause LRCLIB lookups to fail.
   *
   * If no Groq API key is configured, falls back to regex-based cleaning.
   */
  async function cleanTitleForLyrics(
    trackName: string,
    artistName: string,
    albumName: string | null,
    duration: number | null
  ): Promise<{ trackName: string; artistName: string }> {
    const apiKey = getGroqApiKey()

    // No API key — use regex fallback
    if (!apiKey) {
      return {
        trackName: cleanTitleRegex(trackName),
        artistName: cleanTitleRegex(artistName)
      }
    }

    const durationHint = duration ? ` (track duration is approximately ${Math.round(duration)} seconds)` : ''
    const prompt = [
      `You are a music metadata cleaner. Given a YouTube Music track title and artist name, extract ONLY the clean song title and artist name suitable for a lyrics database lookup.`,
      ``,
      `RULES:`,
      `- Remove all text in parentheses (), brackets [], and braces {} that describes video type (e.g. "Official Video", "Music Video", "Lyric Video", "Audio", "HD", "4K", "VEVO", "Clip officiel")`,
      `- Remove text after hyphens or pipes that indicates labels, channels, or descriptions`,
      `- Remove year/number suffixes like "2024", "Remastered 2023", "feat." credits (keep artist name only)`,
      `- Do NOT remove feat./ft. artist names that are part of the song credit — just the primary artist`,
      `- Keep the actual song name and primary artist name intact`,
      `- If the title contains " - " or " | ", the part BEFORE the separator is usually the song title`,
      ``,
      `Respond with ONLY a JSON object, no explanation:`,
      `{"trackName":"clean song title","artistName":"clean artist name"}`,
      ``,
      `Track title: "${trackName}"`,
      `Artist: "${artistName}"${albumName ? `\nAlbum: "${albumName}"` : ''}${durationHint}`
    ].join('\n')

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_completion_tokens: 200,
          response_format: { type: 'json_object' }
        })
      })

      // Rate limited or server error — fall through to regex
      if (res.status === 429) {
        console.warn('Groq API rate limited, using regex fallback for title cleaning')
        return { trackName: cleanTitleRegex(trackName), artistName: cleanTitleRegex(artistName) }
      }
      if (!res.ok) {
        console.warn(`Groq API error ${res.status}, using regex fallback for title cleaning`)
        return { trackName: cleanTitleRegex(trackName), artistName: cleanTitleRegex(artistName) }
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[] }
      const content = data.choices?.[0]?.message?.content
      if (content) {
        const parsed = JSON.parse(content) as { trackName?: string; artistName?: string }
        if (parsed.trackName && parsed.artistName) {
          return {
            trackName: parsed.trackName.trim(),
            artistName: parsed.artistName.trim()
          }
        }
      }
    } catch (err) {
      console.warn('Groq title cleaning failed, using regex fallback:', err)
    }

    // Fallback to regex cleaning
    return {
      trackName: cleanTitleRegex(trackName),
      artistName: cleanTitleRegex(artistName)
    }
  }

  /** Regex-based fallback to strip common YouTube suffixes from titles. */
  function cleanTitleRegex(title: string): string {
    return title
      .replace(/\s*[\(\[\{][^)\]\}]*official[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*[\(\[\{][^)\]\}]*music video[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*[\(\[\{][^)\]\}]*lyric[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*[\(\[\{][^)\]\}]*audio[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*[\(\[\{][^)\]\}]*vevo[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*[\(\[\{][^)\]\}]*4k[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*[\(\[\{][^)\]\}]*hd[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*[\(\[\{][^)\]\}]*clip officiel[^)\]\}]*[\)\]\}]/gi, '')
      .replace(/\s*-\s*(Official|VEVO|Music|Video|Audio|Lyric|HD|4K|Clip officiel).*$/i, '')
      .replace(/\s*\|\s*(Official|VEVO|Music|Video|Audio|Lyric|HD|4K|Clip officiel).*$/i, '')
      .replace(/\s+(feat\.|ft\.)\s+.+$/i, '')
      .replace(/\s*,\s*(Official|VEVO|Music|Video|Audio|Lyric|HD|4K|Clip officiel).*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  /** Parse a single LRC timestamp like "03:20.31" into seconds. */
  function parseLRCTimestamp(ts: string): number | null {
    const parts = ts.split(':')
    if (parts.length !== 2) return null

    const mins = Number(parts[0])
    const secs = Number(parts[1])
    if (!Number.isFinite(mins) || !Number.isFinite(secs) || mins < 0 || secs < 0 || secs >= 60) {
      return null
    }

    return mins * 60 + secs
  }

  /** Parse LRC text into sorted cue lines, including repeated timestamps and global offsets. */
  function parseLRC(lrc: string): { time: number; text: string }[] {
    const offsetMatch = lrc.match(/^\[offset:([+-]?\d+)\]\s*$/im)
    const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0
    const lines: { time: number; text: string }[] = []

    for (const raw of lrc.split('\n')) {
      // Standard LRC permits several timestamps for one lyric line, for example:
      // [00:42.00][01:56.00]Repeated chorus
      const timestamps = Array.from(raw.matchAll(/\[(\d+:\d{1,2}(?:\.\d{1,3})?)\]/g))
      if (timestamps.length === 0) continue

      const text = raw.replace(/\[\d+:\d{1,2}(?:\.\d{1,3})?\]/g, '').trim()
      for (const timestamp of timestamps) {
        const time = parseLRCTimestamp(timestamp[1])
        if (time !== null) {
          lines.push({ time: Math.max(0, time + offsetSeconds), text })
        }
      }
    }

    return lines.sort((a, b) => a.time - b.time)
  }

  ipcMain.handle('music:getLyrics', async (
    _event,
    videoId: string,
    trackName: string,
    artistName: string,
    albumName: string | null,
    duration: number | null,
    filePath?: string | null
  ) => {
    // Check for locally saved lyrics first (for downloaded tracks)
    if (filePath) {
      const localLyrics = readLocalLyrics(filePath)
      if (localLyrics) return localLyrics
    }

    // Clean the track/artist names for better lyrics database matches.
    // YouTube titles often include "(Official Video)", "4K", etc. that break lookups.
    const cleaned = await cleanTitleForLyrics(trackName, artistName, albumName, duration)
    const trackDuration = duration || 0

    interface LRCLIBResult {
      id: number
      trackName: string
      artistName: string
      albumName: string
      duration: number
      instrumental: boolean
      plainLyrics: string | null
      syncedLyrics: string | null
    }

    /** Score an LRCLIB result for best match against our track metadata. */
    function scoreResult(r: LRCLIBResult): number {
      let score = 0

      // Synced lyrics are strongly preferred — they enable the karaoke-style display.
      if (r.syncedLyrics) score += 100

      // Duration proximity: closer match scores higher. A 10-second gap is common
      // between radio/edit and album versions, so use a generous scale.
      if (trackDuration > 0 && r.duration > 0) {
        const diff = Math.abs(r.duration - trackDuration)
        if (diff <= 3) score += 50        // near-exact match
        else if (diff <= 10) score += 35   // minor difference (radio vs album edit)
        else if (diff <= 30) score += 15   // noticeable but plausible
        // > 30s apart: no duration bonus — likely a live or remixed version
      }

      // Album name match is a soft signal — many LRCLIB entries use "-" or blank.
      if (albumName && r.albumName && r.albumName !== '-' && r.albumName.toLowerCase() === albumName.toLowerCase()) {
        score += 10
      }

      return score
    }

    // ── Source 1: Musixmatch (via musixmlrc) ──────────────────────────────
    // Musixmatch has the largest synced lyrics database. Try it first.
    // Only return immediately on synced; store plain as a fallback so LRCLIB
    // still gets a chance to provide synced lyrics.
    let musixmatchPlain: string[] | null = null

    try {
      const { Song } = await import('musixmlrc/dist/song.js')
      const { Musixmatch } = await import('musixmlrc/dist/musixmatch.js')

      const song = new Song(cleaned.artistName, cleaned.trackName, albumName || '', '')
      if (trackDuration > 0) {
        song.duration = trackDuration * 1000 // musixmlrc expects milliseconds
      }

      const mxm = new Musixmatch(musixmatchToken ?? undefined)
      const body = await mxm.findLyrics(song)
      // Cache the token for subsequent requests to avoid re-fetching
      const currentToken = (mxm as any).token
      if (currentToken && currentToken !== musixmatchToken) {
        musixmatchToken = currentToken
      }
      if (body) {
        song.updateInfo(body)

        // Try synced lyrics first (subtitles with timestamps)
        if (Musixmatch.getSynced(song, body) && song.subtitles && song.subtitles.length > 0) {
          const synced = song.subtitles
            .filter(line => line.text.trim() !== '')
            .map(line => ({
              time: line.minutes * 60 + line.seconds + line.hundredths / 100,
              text: line.text
            }))
          if (synced.length > 0) {
            return { plain: [], synced, provider: 'Musixmatch' }
          }
        }

        // Store unsynced as fallback — don't return yet, let LRCLIB try for synced
        if (Musixmatch.getUnsynced(song, body) && song.lyrics && song.lyrics.length > 0) {
          const plain = song.lyrics.map(l => l.text).filter(t => t.trim() !== '')
          if (plain.length > 0) {
            musixmatchPlain = plain
          }
        }
      }
    } catch (err) {
      console.warn('[lyrics] Musixmatch lookup failed, trying LRCLIB:', err instanceof Error ? err.message : 'unknown error')
    }

    // ── Source 2: LRCLIB ─────────────────────────────────────────────────
    // Use /api/search (returns multiple candidates) so we can pick the best match
    // based on duration proximity and synced-lyric availability.
    let bestLRCLIB: { plain: string[]; synced: { time: number; text: string }[] } | null = null
    let bestScore = -1

    try {
      const params = new URLSearchParams({
        track_name: cleaned.trackName,
        artist_name: cleaned.artistName
      })
      // Only include album if it has a real value (not empty / placeholder "-")
      if (albumName && albumName !== '-') {
        params.set('album_name', albumName)
      }
      const res = await fetch(`https://lrclib.net/api/search?${params}`, {
        headers: { 'User-Agent': 'Hyro Music v1.0.0 (https://github.com/hyro-music)' }
      })
      if (res.ok) {
        const results = await res.json() as LRCLIBResult[]
        for (const r of results) {
          if (r.instrumental) continue
          const score = scoreResult(r)
          if (score > bestScore) {
            bestScore = score
            const plain = r.plainLyrics
              ? r.plainLyrics.split('\n').filter((l) => l.trim() !== '')
              : []
            const synced = r.syncedLyrics ? parseLRC(r.syncedLyrics) : []
            bestLRCLIB = { plain, synced }
          }
        }
      }
    } catch {
      // LRCLIB is unavailable — fall through to YouTube Music fallback.
    }

    // If the best LRCLIB result has synced lyrics, return it immediately.
    if (bestLRCLIB && bestLRCLIB.synced.length > 0) {
      return { ...bestLRCLIB, provider: 'LRCLIB' }
    }

    // LRCLIB plain lyrics — prefer over Musixmatch plain since LRCLIB has better metadata.
    if (bestLRCLIB && bestLRCLIB.plain.length > 0) {
      return { ...bestLRCLIB, provider: 'LRCLIB' }
    }

    // Musixmatch plain lyrics stored earlier.
    if (musixmatchPlain && musixmatchPlain.length > 0) {
      return { plain: musixmatchPlain, synced: [], provider: 'Musixmatch' }
    }

    // ── Source 3: YouTube Music (plain lyrics only) ──────────────────────
    // Try InnerTube first (with retry), then fall back to ytmusic-api
    try {
      const lyricsResponse = await withInnertubeRetry('getLyrics', async (yt) => {
        return await yt.music.getLyrics(videoId)
      })
      if (lyricsResponse?.description?.text) {
        const plain = lyricsResponse.description.text
          .split('\n')
          .filter((l: string) => l.trim() !== '')
        if (plain.length > 0) {
          return { plain, synced: [], provider: 'YouTube Music' }
        }
      }
    } catch {
      // InnerTube lyrics unavailable, try ytmusic-api fallback
      try {
        const ytmLyrics = await getYTMusic().getLyrics(videoId)
        if (ytmLyrics && ytmLyrics.length > 0) {
          return { plain: ytmLyrics, synced: [], provider: 'YouTube Music' }
        }
      } catch {
        // YouTube Music has no lyrics for this track.
      }
    }

    return null
  })

  ipcMain.handle('player:getStreamUrl', async (_event, videoId: string) => {
    // Primary: InnerTube multi-client stream resolution (ANDROID_VR, IOS, ANDROID, TV, WEB)
    // ANDROID_VR returns direct pre-deciphered stream URLs that return 200 OK across Chromium/desktop HTMLAudioElement.
    try {
      const url = await withInnertubeRetry('getStreamUrl', async (yt) => {
        const preferredClients: Array<any> = ['ANDROID_VR', 'IOS', 'ANDROID', 'TV', 'WEB']
        for (const client of preferredClients) {
          try {
            const info = await yt.getBasicInfo(videoId, { client })
            const format = info.chooseFormat({ type: 'audio', quality: 'best' })
            if (format) {
              const streamUrl = await format.decipher(yt.session.player)
              if (streamUrl && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
                return streamUrl
              }
            }
          } catch {
            // Try next client in chain
          }
        }

        // If client-specific getBasicInfo fails, fallback to standard getStreamingData
        const format = await yt.getStreamingData(videoId, { type: 'audio', quality: 'best' })
        if (format) {
          const streamUrl = await format.decipher(yt.session.player)
          if (streamUrl && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
            return streamUrl
          }
        }
        return null
      })
      if (url) {
        console.log(`[stream] Resolved stream URL via InnerTube for ${videoId} ✓`)
        return url
      }
    } catch (err) {
      console.warn(`[stream] InnerTube player failed for ${videoId} (after retry), falling back to yt-dlp:`, err)
    }

    // Fallback: yt-dlp CLI
    const url = `https://www.youtube.com/watch?v=${videoId}`
    const MAX_RETRIES = 2
    const RETRY_DELAY_MS = 2000

    const args = ['-f', 'bestaudio', '--extractor-args', 'youtube:player_client=android_vr,ios,android,web', '--get-url', url]
    const cookieBrowser = getCookieBrowser()
    if (cookieBrowser) {
      args.push('--cookies-from-browser', cookieBrowser)
    }

    const cmdStr = `yt-dlp ${args.map(a => `"${a}"`).join(' ')}`
    console.log(`[stream] Resolving stream URL via yt-dlp for ${videoId}...`)
    console.log(`[stream] Command: ${cmdStr}`)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { stdout } = await execFileAsync('yt-dlp', args, { timeout: 30000 })
        const streamUrl = stdout.trim()
        if (!streamUrl) throw new Error('Empty stream URL from yt-dlp')
        if (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
          throw new Error(`Invalid stream URL format: ${streamUrl.slice(0, 100)}`)
        }
        console.log(`[stream] Resolved stream URL via yt-dlp for ${videoId} ✓`)
        return streamUrl
      } catch (err: any) {
        const isLastAttempt = attempt === MAX_RETRIES
        if (isLastAttempt) {
          console.error(`[stream] FAILED for ${videoId} after ${attempt + 1} attempt(s): ${err.message}`)
          throw new Error(`Failed to get stream URL: ${err.message}`)
        }
        console.warn(`[stream] Attempt ${attempt + 1} failed for ${videoId}, retrying in ${RETRY_DELAY_MS}ms: ${err.message}`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
    throw new Error('Failed to get stream URL: exhausted retries')
  })
}
