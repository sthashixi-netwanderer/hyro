import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { Track } from '../../../shared/types'

export interface DownloadItem {
  id: string
  type: 'track' | 'album' | 'playlist'
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
  tracks?: Track[]
}

interface QueuedDownload {
  id: string
  type: 'track' | 'album' | 'playlist'
  trackName: string
  track?: Track
  album?: any
  playlist?: any
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
  cancelDownload: (id: string) => void
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

  useEffect(() => {
    const removeListener = window.api.onDownloadProgress((data) => {
      setDownloads(prev => {
        const existing = prev.find(d => d.id === data.id)
        if (existing) {
          return prev.map(d => d.id === data.id ? { ...d, ...data, trackName: data.trackName || existing.trackName } : d)
        }
        const meta = trackMetadataRef.current.get(data.id)
        const resolvedName = data.trackName || meta?.track?.name || meta?.album?.name || meta?.playlist?.name || data.id
        return [...prev, {
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
      })

      if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
        activeCountRef.current = Math.max(0, activeCountRef.current - 1)
        processQueue()
      }

      if (data.status === 'done') {
        refreshDownloaded()
      }
    })

    return () => {
      removeListener()
    }
  }, [refreshDownloaded])

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

  const cancelDownload = useCallback(async (id: string) => {
    // Remove from queue if queued
    queueRef.current = queueRef.current.filter(q => q.id !== id)
    await window.api.cancelDownload(id)
    setDownloads(prev => prev.map(d =>
      d.id === id ? { ...d, status: 'cancelled' as const, progress: 0 } : d
    ))
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
      cancelDownload,
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
