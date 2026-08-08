import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { Track } from '../../../shared/types'

export interface DownloadItem {
  id: string
  type: 'track' | 'album' | 'playlist' | 'artist'
  trackName: string
  progress: number
  status: 'downloading' | 'done' | 'error' | 'cancelled' | 'interrupted' | 'queued'
  error?: string
  trackIndex?: number
  totalTracks?: number
  // Persisted metadata for re-initiation
  track?: Track
  album?: any
  playlist?: any
  artist?: any
  tracks?: Track[]
}

interface QueuedDownload {
  id: string
  type: 'track' | 'album' | 'playlist' | 'artist'
  trackName: string
  track?: Track
  album?: any
  playlist?: any
  artist?: any
  tracks?: Track[]
}

interface DownloadContextType {
  downloads: DownloadItem[]
  activeCount: number
  queuedCount: number
  downloadedVideoIds: Set<string>
  isDownloaded: (videoId: string) => boolean
  allDownloaded: (tracks: Track[]) => boolean
  someDownloaded: (tracks: Track[]) => boolean
  downloadTrack: (track: any) => void
  downloadAlbum: (album: any, tracks: Track[]) => void
  downloadPlaylist: (playlist: any, tracks: Track[]) => void
  downloadArtist: (artist: any, tracks: Track[], albums: any[], singles: any[]) => void
  cancelDownload: (id: string) => void
  cancelContainerDownloads: (containerId: string) => void
  retryDownload: (item: DownloadItem) => void
  dismissCompleted: () => void
  dismissDownload: (id: string) => void
  isDownloading: (id: string) => boolean
  getProgress: (id: string) => DownloadItem | undefined
  refreshDownloaded: () => Promise<void>
  isPopupExpanded: boolean
  setIsPopupExpanded: (expanded: boolean) => void
}

const DownloadContext = createContext<DownloadContextType | null>(null)

export function useDownload(): DownloadContextType {
  const ctx = useContext(DownloadContext)
  if (!ctx) throw new Error('useDownload must be used within DownloadProvider')
  return ctx
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [downloadedVideoIds, setDownloadedVideoIds] = useState<Set<string>>(new Set())
  const [isPopupExpanded, setIsPopupExpanded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackMetadataRef = useRef<Map<string, { track?: Track; album?: any; playlist?: any; tracks?: Track[] }>>(new Map())
  const maxConcurrentRef = useRef(1)
  const activeCountRef = useRef(0)
  const queueRef = useRef<QueuedDownload[]>([])

  // Debounced save to disk
  const persistQueue = useCallback((items: DownloadItem[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const toSave = items.filter(d => d.status !== 'done')
      window.api.saveDownloadQueue(toSave)
    }, 500)
  }, [])

  // Load persisted queue on mount
  useEffect(() => {
    window.api.loadDownloadQueue().then((saved: any[]) => {
      if (!saved || saved.length === 0) return
      const restored: DownloadItem[] = saved.map((item: any) => ({
        ...item,
        status: item.status === 'downloading' ? 'interrupted' as const : item.status
      }))
      setDownloads(restored)
    })

    // Load max concurrent downloads setting
    window.api.getSettings().then((settings: any) => {
      if (typeof settings.maxConcurrentDownloads === 'number') {
        maxConcurrentRef.current = settings.maxConcurrentDownloads
      }
    }).catch(() => {})
  }, [])

  // Re-read max concurrent downloads when window gains focus (catches setting changes)
  useEffect(() => {
    const handleFocus = () => {
      window.api.getSettings().then((settings: any) => {
        if (typeof settings.maxConcurrentDownloads === 'number') {
          maxConcurrentRef.current = settings.maxConcurrentDownloads
        }
      }).catch(() => {})
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Persist queue whenever downloads change
  useEffect(() => {
    if (downloads.length > 0) {
      persistQueue(downloads)
    }
  }, [downloads, persistQueue])

  const refreshDownloaded = useCallback(async () => {
    try {
      const tracks = await window.api.getLibraryTracks()
      const ids = new Set<string>(tracks.map((t: any) => t.videoId).filter(Boolean))
      setDownloadedVideoIds(ids)
    } catch {
      // Library might not have any tracks yet
    }
  }, [])

  useEffect(() => {
    refreshDownloaded()
  }, [refreshDownloaded])

  useEffect(() => {
    const handleFocus = () => {
      refreshDownloaded()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshDownloaded])

  // ── Batched / throttled progress: coalesce at ~12 Hz to prevent React flood (≈100 → 12 updates/s) ──
  const pendingUpdatesRef = useRef<Map<string, any>>(new Map())
  const flushFrameRef = useRef<number | null>(null)
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPending = useCallback(() => {
    if (pendingUpdatesRef.current.size === 0) return
    const batch = Array.from(pendingUpdatesRef.current.values())
    pendingUpdatesRef.current.clear()
    if (flushFrameRef.current !== null) { cancelAnimationFrame(flushFrameRef.current); flushFrameRef.current = null }
    if (flushTimeoutRef.current) { clearTimeout(flushTimeoutRef.current); flushTimeoutRef.current = null }

    setDownloads(prev => {
      let next = prev
      let changed = false
      for (const data of batch) {
        const existing = next.find(d => d.id === data.id)
        if (existing) {
          // Skip if progress/status identical (dedupe)
          if (existing.progress === data.progress && existing.status === data.status) continue
          next = next.map(d => d.id === data.id ? { ...d, ...data, trackName: data.trackName || existing.trackName } : d)
          changed = true
        } else {
          const meta = trackMetadataRef.current.get(data.id)
          const resolvedName = data.trackName || meta?.track?.name || meta?.album?.name || meta?.playlist?.name || data.id
          next = [...next, {
            id: data.id,
            type: data.type,
            trackName: resolvedName,
            progress: data.progress,
            status: data.status,
            error: data.error,
            trackIndex: data.trackIndex,
            totalTracks: data.totalTracks,
            track: meta?.track,
            album: meta?.album,
            playlist: meta?.playlist,
            tracks: meta?.tracks
          }]
          changed = true
        }
      }
      return changed ? next : prev
    })

    // Defer queue bookkeeping until after state flush to avoid interleaving
    for (const data of batch) {
      if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
        const isContainerEvent = (id: string) => (id.match(/:/g) || []).length === 1 || !id.includes(':')
        if (isContainerEvent(data.id)) {
          activeCountRef.current = Math.max(0, activeCountRef.current - 1)
          processQueue()
        }
      }
      if (data.status === 'done') refreshDownloaded()
    }
  }, [refreshDownloaded])

  const scheduleFlush = useCallback((immediate = false) => {
    if (immediate) {
      if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current)
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current)
      flushFrameRef.current = null
      flushTimeoutRef.current = null
      flushPending()
      return
    }
    // Use rAF for smooth UI + fallback timeout for background tabs where rAF is throttled
    if (flushFrameRef.current === null) {
      flushFrameRef.current = requestAnimationFrame(() => {
        flushFrameRef.current = null
        flushPending()
      })
    }
    if (!flushTimeoutRef.current) {
      flushTimeoutRef.current = setTimeout(() => {
        if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current)
        flushFrameRef.current = null
        flushTimeoutRef.current = null
        flushPending()
      }, 90)
    }
  }, [flushPending])

  useEffect(() => {
    const removeListener = window.api.onDownloadProgress((data) => {
      const isTerminal = data.status === 'done' || data.status === 'error' || data.status === 'cancelled'
      // Terminal events bypass batching for snappy UI
      if (isTerminal) {
        pendingUpdatesRef.current.set(data.id, data)
        scheduleFlush(true)
        return
      }
      // Coalesce downloading progress (≈100/s → ≤12/s)
      pendingUpdatesRef.current.set(data.id, data)
      scheduleFlush(false)
    })

    return () => {
      removeListener()
      if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current)
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current)
    }
  }, [scheduleFlush])

  const isDownloaded = useCallback((videoId: string) => {
    return downloadedVideoIds.has(videoId)
  }, [downloadedVideoIds])

  const allDownloaded = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return false
    return tracks.every(t => downloadedVideoIds.has(t.videoId))
  }, [downloadedVideoIds])

  const someDownloaded = useCallback((tracks: Track[]) => {
    return tracks.some(t => downloadedVideoIds.has(t.videoId))
  }, [downloadedVideoIds])

  // Process the download queue
  const processQueue = useCallback(() => {
    while (queueRef.current.length > 0 && activeCountRef.current < maxConcurrentRef.current) {
      const next = queueRef.current.shift()!
      activeCountRef.current++

      if (next.type === 'track' && next.track) {
        window.api.downloadTrack(next.track).catch(() => {})
      } else if (next.type === 'album' && next.album && next.tracks) {
        window.api.downloadAlbum(next.album, next.tracks).catch(() => {})
      } else if (next.type === 'playlist' && next.playlist && next.tracks) {
        window.api.downloadPlaylist(next.playlist, next.tracks).catch(() => {})
      } else {
        activeCountRef.current--
      }
    }
  }, [])

  const downloadTrack = useCallback((track: any) => {
    if (downloadedVideoIds.has(track.videoId)) return
    trackMetadataRef.current.set(track.videoId, { track })

    const item: QueuedDownload = {
      id: track.videoId,
      type: 'track',
      trackName: track.name,
      track
    }

    if (activeCountRef.current < maxConcurrentRef.current) {
      activeCountRef.current++
      window.api.downloadTrack(track).catch(() => {})
    } else {
      queueRef.current.push(item)
      setDownloads(prev => [...prev, {
        id: track.videoId,
        type: 'track',
        trackName: track.name,
        progress: 0,
        status: 'queued',
        track
      }])
    }
  }, [downloadedVideoIds])

  const downloadAlbum = useCallback((album: any, tracks: Track[]) => {
    const toDownload = tracks.filter(t => !downloadedVideoIds.has(t.videoId))
    if (toDownload.length === 0) return
    for (const t of toDownload) {
      trackMetadataRef.current.set(`album:${album.albumId}:${t.videoId}`, { track: t, album, tracks: toDownload })
    }

    const id = `album:${album.albumId}`
    const item: QueuedDownload = {
      id,
      type: 'album',
      trackName: album.name,
      album,
      tracks: toDownload
    }

    if (activeCountRef.current < maxConcurrentRef.current) {
      activeCountRef.current++
      window.api.downloadAlbum(album, toDownload).catch(() => {})
    } else {
      queueRef.current.push(item)
      setDownloads(prev => [...prev, {
        id,
        type: 'album',
        trackName: album.name,
        progress: 0,
        status: 'queued',
        album,
        tracks: toDownload
      }])
    }
  }, [downloadedVideoIds])

  const downloadPlaylist = useCallback((playlist: any, tracks: Track[]) => {
    const toDownload = tracks.filter(t => !downloadedVideoIds.has(t.videoId))
    if (toDownload.length === 0) return
    for (const t of toDownload) {
      trackMetadataRef.current.set(`playlist:${playlist.playlistId}:${t.videoId}`, { track: t, playlist, tracks: toDownload })
    }

    const id = `playlist:${playlist.playlistId}`
    const item: QueuedDownload = {
      id,
      type: 'playlist',
      trackName: playlist.name,
      playlist,
      tracks: toDownload
    }

    if (activeCountRef.current < maxConcurrentRef.current) {
      activeCountRef.current++
      window.api.downloadPlaylist(playlist, toDownload).catch(() => {})
    } else {
      queueRef.current.push(item)
      setDownloads(prev => [...prev, {
        id,
        type: 'playlist',
        trackName: playlist.name,
        progress: 0,
        status: 'queued',
        playlist,
        tracks: toDownload
      }])
    }
  }, [downloadedVideoIds])

  const downloadArtist = useCallback((artist: any, tracks: Track[], albums: any[], singles: any[]) => {
    // Filter out already-downloaded tracks
    const toDownload = tracks.filter(t => !downloadedVideoIds.has(t.videoId))
    if (toDownload.length === 0) return

    // Build a set of videoIds that belong to albums/singles
    const albumTrackIds = new Set<string>()
    for (const container of [...albums, ...singles]) {
      for (const t of toDownload) {
        if (t.album?.albumId === container.albumId) {
          albumTrackIds.add(t.videoId)
        }
      }
    }

    // Download each album/single that has downloadable tracks
    for (const container of [...albums, ...singles]) {
      const containerTracks = toDownload.filter(t => t.album?.albumId === container.albumId)
      if (containerTracks.length > 0) {
        downloadAlbum(container, containerTracks)
      }
    }

    // Download remaining tracks (top songs not on any album/single)
    const standaloneTracks = toDownload.filter(t => !albumTrackIds.has(t.videoId))
    for (const track of standaloneTracks) {
      downloadTrack(track)
    }
  }, [downloadedVideoIds, downloadAlbum, downloadTrack])

  const cancelDownload = useCallback(async (id: string) => {
    // Remove from queue if queued
    queueRef.current = queueRef.current.filter(q => q.id !== id)
    await window.api.cancelDownload(id)
    setDownloads(prev => prev.map(d =>
      d.id === id ? { ...d, status: 'cancelled' as const, progress: 0 } : d
    ))
  }, [])

  const cancelContainerDownloads = useCallback(async (containerId: string) => {
    // Cancel the container-level download and all its individual track downloads
    queueRef.current = queueRef.current.filter(q => q.id !== containerId && !q.id.startsWith(containerId + ':'))
    await window.api.cancelDownload(containerId)
    setDownloads(prev => prev.map(d => {
      if (d.id === containerId || d.id.startsWith(containerId + ':')) {
        if (d.status === 'downloading' || d.status === 'queued') {
          window.api.cancelDownload(d.id).catch(() => {})
          return { ...d, status: 'cancelled' as const, progress: 0 }
        }
      }
      return d
    }))
  }, [])

  const retryDownload = useCallback(async (item: DownloadItem) => {
    if (item.type === 'track' && item.track) {
      setDownloads(prev => prev.filter(d => d.id !== item.id))
      downloadTrack(item.track)
    } else if (item.type === 'album' && item.album && item.tracks) {
      setDownloads(prev => prev.filter(d => d.id !== item.id))
      downloadAlbum(item.album, item.tracks)
    } else if (item.type === 'playlist' && item.playlist && item.tracks) {
      setDownloads(prev => prev.filter(d => d.id !== item.id))
      downloadPlaylist(item.playlist, item.tracks)
    }
  }, [downloadTrack, downloadAlbum, downloadPlaylist])

  const dismissCompleted = useCallback(() => {
    setDownloads(prev => prev.filter(d => d.status === 'downloading' || d.status === 'interrupted' || d.status === 'queued'))
  }, [])

  const dismissDownload = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter(q => q.id !== id)
    setDownloads(prev => prev.filter(d => d.id !== id))
  }, [])

  const isDownloading = useCallback((id: string) => {
    return downloads.some(d => (d.id === id || d.id.endsWith(`:${id}`)) && (d.status === 'downloading' || d.status === 'queued'))
  }, [downloads])

  const getProgress = useCallback((id: string) => {
    return downloads.find(d => d.id === id || d.id.endsWith(`:${id}`))
  }, [downloads])

  const activeCount = downloads.filter(d => d.status === 'downloading').length
  const queuedCount = downloads.filter(d => d.status === 'queued').length

  useEffect(() => {
    if (activeCount === 0 && isPopupExpanded) {
      setIsPopupExpanded(false)
    }
  }, [activeCount, isPopupExpanded])

  return (
    <DownloadContext.Provider value={{
      downloads,
      activeCount,
      queuedCount,
      downloadedVideoIds,
      isDownloaded,
      allDownloaded,
      someDownloaded,
      downloadTrack,
      downloadAlbum,
      downloadPlaylist,
      downloadArtist,
      cancelDownload,
      cancelContainerDownloads,
      retryDownload,
      dismissCompleted,
      dismissDownload,
      isDownloading,
      getProgress,
      refreshDownloaded,
      isPopupExpanded,
      setIsPopupExpanded
    }}>
      {children}
    </DownloadContext.Provider>
  )
}
