import { logger } from '../utils/logger'
import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Track } from '../../../shared/types'

interface LikedSongsContextType {
  tracks: Track[]
  loading: boolean
  isLiked: (videoId: string) => boolean
  toggleLike: (track: Track) => Promise<boolean>
  addTracks: (tracks: Track[]) => Promise<void>
  removeTrack: (videoId: string) => Promise<void>
  removeTracks: (videoIds: string[]) => Promise<void>
  refresh: () => Promise<void>
}

const LikedSongsContext = createContext<LikedSongsContextType | null>(null)

export function useLikedSongs(): LikedSongsContextType {
  const ctx = useContext(LikedSongsContext)
  if (!ctx) throw new Error('useLikedSongs must be used within LikedSongsProvider')
  return ctx
}

export function LikedSongsProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLikedSongs()
  }, [])

  async function loadLikedSongs() {
    try {
      const items = await window.api.getLikedSongs()
      setTracks(items)
    } catch (err) {
      logger.error('Failed to load liked songs:', err)
    } finally {
      setLoading(false)
    }
  }

  const isLiked = useCallback((videoId: string) => {
    return tracks.some(t => t.videoId === videoId)
  }, [tracks])

  const toggleLike = useCallback(async (track: Track) => {
    try {
      const result = await window.api.toggleLikedSong(track)
      setTracks(result.tracks)
      return result.added
    } catch (err) {
      logger.error('Failed to toggle liked song:', err)
      return false
    }
  }, [])

  const addTracks = useCallback(async (newTracks: Track[]) => {
    try {
      const items = await window.api.addLikedSongs(newTracks)
      setTracks(items)
    } catch (err) {
      logger.error('Failed to add liked songs:', err)
    }
  }, [])

  const removeTrack = useCallback(async (videoId: string) => {
    try {
      const items = await window.api.removeLikedSong(videoId)
      setTracks(items)
    } catch (err) {
      logger.error('Failed to remove liked song:', err)
    }
  }, [])

  const removeTracks = useCallback(async (videoIds: string[]) => {
    try {
      const items = await window.api.removeLikedSongs(videoIds)
      setTracks(items)
    } catch (err) {
      logger.error('Failed to remove liked songs:', err)
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadLikedSongs()
  }, [])

  return (
    <LikedSongsContext.Provider value={{ tracks, loading, isLiked, toggleLike, addTracks, removeTrack, removeTracks, refresh }}>
      {children}
    </LikedSongsContext.Provider>
  )
}
