import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { Track } from '../../../shared/types'

export interface DownloadItem {
  id: string
  type: 'track' | 'album' | 'playlist'
  trackName: string
  progress: number
  status: 'downloading' | 'done' | 'error' | 'cancelled' | 'interrupted'
  error?: string
  trackIndex?: number
  totalTracks?: number
  // Persisted metadata for re-initiation
  track?: Track
  album?: any
  playlist?: any
  tracks?: Track[]
}

interface DownloadContextType {
  downloads: DownloadItem[]
  activeCount: number
  downloadedVideoIds: Set<string>
  isDownloaded: (videoId: string) => boolean
  allDownloaded: (tracks: Track[]) => boolean
  someDownloaded: (tracks: Track[]) => boolean
  downloadTrack: (track: any) => Promise<void>
  downloadAlbum: (album: any, tracks: Track[]) => Promise<void>
  downloadPlaylist: (playlist: any, tracks: Track[]) => Promise<void>
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
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stores full track metadata keyed by download ID for persistence
  const trackMetadataRef = useRef<Map<string, { track?: Track; album?: any; playlist?: any; tracks?: Track[] }>>(new Map())

  // Debounced save to disk
  const persistQueue = useCallback((items: DownloadItem[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      // Only persist items that aren't done (no need to save completed ones)
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
        // Mark any in-progress downloads as interrupted
        status: item.status === 'downloading' ? 'interrupted' as const : item.status
      }))
      setDownloads(restored)
    })
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

  // Automatically refresh when window gains focus (detect manual deletions outside the app)
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
        // Retrieve stored metadata for this download
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

      // When a download completes, refresh the downloaded set
      if (data.status === 'done') {
        refreshDownloaded()
      }
    })

    return () => {
      removeListener()
    }
  }, [refreshDownloaded])

  // Auto-dismiss disabled, downloads are persisted and cleared manually via UI.

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

  const downloadTrack = useCallback(async (track: any) => {
    if (downloadedVideoIds.has(track.videoId)) return
    trackMetadataRef.current.set(track.videoId, { track })
    await window.api.downloadTrack(track)
  }, [downloadedVideoIds])

  const downloadAlbum = useCallback(async (album: any, tracks: Track[]) => {
    // Filter out already-downloaded tracks
    const toDownload = tracks.filter(t => !downloadedVideoIds.has(t.videoId))
    if (toDownload.length === 0) return
    // Store metadata for each track
    for (const t of toDownload) {
      trackMetadataRef.current.set(`album:${album.albumId}:${t.videoId}`, { track: t, album, tracks: toDownload })
    }
    await window.api.downloadAlbum(album, toDownload)
  }, [downloadedVideoIds])

  const downloadPlaylist = useCallback(async (playlist: any, tracks: Track[]) => {
    // Filter out already-downloaded tracks
    const toDownload = tracks.filter(t => !downloadedVideoIds.has(t.videoId))
    if (toDownload.length === 0) return
    // Store metadata for each track
    for (const t of toDownload) {
      trackMetadataRef.current.set(`playlist:${playlist.playlistId}:${t.videoId}`, { track: t, playlist, tracks: toDownload })
    }
    await window.api.downloadPlaylist(playlist, toDownload)
  }, [downloadedVideoIds])

  const cancelDownload = useCallback(async (id: string) => {
    await window.api.cancelDownload(id)
    // Mark as cancelled locally
    setDownloads(prev => prev.map(d =>
      d.id === id ? { ...d, status: 'cancelled' as const, progress: 0 } : d
    ))
  }, [])

  const retryDownload = useCallback(async (item: DownloadItem) => {
    if (item.type === 'track' && item.track) {
      // Remove the interrupted item and re-initiate
      setDownloads(prev => prev.filter(d => d.id !== item.id))
      await window.api.downloadTrack(item.track)
    } else if (item.type === 'album' && item.album && item.tracks) {
      setDownloads(prev => prev.filter(d => d.id !== item.id))
      await window.api.downloadAlbum(item.album, item.tracks)
    } else if (item.type === 'playlist' && item.playlist && item.tracks) {
      setDownloads(prev => prev.filter(d => d.id !== item.id))
      await window.api.downloadPlaylist(item.playlist, item.tracks)
    }
  }, [])

  const dismissCompleted = useCallback(() => {
    setDownloads(prev => prev.filter(d => d.status === 'downloading' || d.status === 'interrupted'))
  }, [])

  const dismissDownload = useCallback((id: string) => {
    setDownloads(prev => prev.filter(d => d.id !== id))
  }, [])

  const isDownloading = useCallback((id: string) => {
    return downloads.some(d => (d.id === id || d.id.endsWith(`:${id}`)) && d.status === 'downloading')
  }, [downloads])

  const getProgress = useCallback((id: string) => {
    return downloads.find(d => d.id === id || d.id.endsWith(`:${id}`))
  }, [downloads])

  const activeCount = downloads.filter(d => d.status === 'downloading').length

  useEffect(() => {
    if (activeCount === 0 && isPopupExpanded) {
      setIsPopupExpanded(false)
    }
  }, [activeCount, isPopupExpanded])

  return (
    <DownloadContext.Provider value={{
      downloads,
      activeCount,
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
