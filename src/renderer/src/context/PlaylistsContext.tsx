import { logger } from '../utils/logger'
import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { UserPlaylist, Track } from '../../../shared/types'

interface PlaylistsContextType {
  playlists: UserPlaylist[]
  loading: boolean
  createPlaylist: (name: string, description?: string) => Promise<UserPlaylist | null>
  renamePlaylist: (id: string, name: string) => Promise<void>
  deletePlaylist: (id: string) => Promise<void>
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<boolean>
  addTracksToPlaylist: (playlistId: string, tracks: Track[]) => Promise<number>
  removeTrackFromPlaylist: (playlistId: string, videoId: string) => Promise<void>
  refresh: () => Promise<void>
}

const PlaylistsContext = createContext<PlaylistsContextType | null>(null)

export function usePlaylists(): PlaylistsContextType {
  const ctx = useContext(PlaylistsContext)
  if (!ctx) throw new Error('usePlaylists must be used within PlaylistsProvider')
  return ctx
}

export function PlaylistsProvider({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPlaylists()
  }, [])

  async function loadPlaylists() {
    try {
      const items = await window.api.getPlaylists()
      setPlaylists(items)
    } catch (err) {
      logger.error('Failed to load playlists:', err)
    } finally {
      setLoading(false)
    }
  }

  const createPlaylist = useCallback(async (name: string, description?: string) => {
    try {
      const playlist = await window.api.createPlaylist(name, description)
      setPlaylists(prev => [playlist, ...prev])
      return playlist
    } catch (err) {
      logger.error('Failed to create playlist:', err)
      return null
    }
  }, [])

  const renamePlaylist = useCallback(async (id: string, name: string) => {
    try {
      const updated = await window.api.renamePlaylist(id, name)
      if (updated) {
        setPlaylists(prev => prev.map(p => p.id === id ? updated : p))
      }
    } catch (err) {
      logger.error('Failed to rename playlist:', err)
    }
  }, [])

  const deletePlaylist = useCallback(async (id: string) => {
    try {
      await window.api.deletePlaylist(id)
      setPlaylists(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      logger.error('Failed to delete playlist:', err)
    }
  }, [])

  const addTrackToPlaylist = useCallback(async (playlistId: string, track: Track) => {
    try {
      const result = await window.api.addTrackToPlaylist(playlistId, track)
      if (result.added && result.playlist) {
        setPlaylists(prev => prev.map(p => p.id === playlistId ? result.playlist : p))
      }
      return result.added
    } catch (err) {
      logger.error('Failed to add track to playlist:', err)
      return false
    }
  }, [])

  const addTracksToPlaylist = useCallback(async (playlistId: string, tracks: Track[]) => {
    try {
      const result = await window.api.addTracksToPlaylist(playlistId, tracks)
      if (result.playlist) {
        setPlaylists(prev => prev.map(p => p.id === playlistId ? result.playlist : p))
      }
      return result.addedCount
    } catch (err) {
      logger.error('Failed to add tracks to playlist:', err)
      return 0
    }
  }, [])

  const removeTrackFromPlaylist = useCallback(async (playlistId: string, videoId: string) => {
    try {
      const updated = await window.api.removeTrackFromPlaylist(playlistId, videoId)
      if (updated) {
        setPlaylists(prev => prev.map(p => p.id === playlistId ? updated : p))
      }
    } catch (err) {
      logger.error('Failed to remove track from playlist:', err)
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadPlaylists()
  }, [])

  return (
    <PlaylistsContext.Provider value={{
      playlists, loading, createPlaylist, renamePlaylist, deletePlaylist,
      addTrackToPlaylist, addTracksToPlaylist, removeTrackFromPlaylist, refresh
    }}>
      {children}
    </PlaylistsContext.Provider>
  )
}
