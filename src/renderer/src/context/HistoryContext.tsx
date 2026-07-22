import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Track } from '../../../shared/types'
import { usePlayer } from './PlayerContext'

export interface HistoryEntry {
  videoId: string
  name: string
  artist: { artistId: string | null; name: string }
  album: { albumId: string; name: string } | null
  duration: number | null
  thumbnails: Array<{ url: string; width: number; height: number }>
  type: 'SONG' | 'VIDEO'
  filePath?: string | null
  thumbnailPath?: string | null
  playedAt: string
}

interface HistoryContextType {
  history: HistoryEntry[]
  loading: boolean
  addTrack: (track: Track) => Promise<void>
  removeTracks: (videoIds: string[]) => Promise<void>
  clearAll: () => Promise<void>
}

const HistoryContext = createContext<HistoryContextType | null>(null)

export function useHistory(): HistoryContextType {
  const ctx = useContext(HistoryContext)
  if (!ctx) throw new Error('useHistory must be used within HistoryProvider')
  return ctx
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const { currentTrack } = usePlayer()

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      const entries = await window.api.getHistory()
      setHistory(entries)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setLoading(false)
    }
  }

  const addTrack = useCallback(async (track: Track) => {
    try {
      const entries = await window.api.addHistory(track)
      setHistory(entries)
    } catch (err) {
      console.error('Failed to add to history:', err)
    }
  }, [])

  // Automatically add the track to history when it starts playing
  useEffect(() => {
    if (currentTrack) {
      addTrack(currentTrack)
    }
  }, [currentTrack?.videoId, addTrack])

  const removeTracks = useCallback(async (videoIds: string[]) => {
    try {
      const entries = await window.api.removeHistory(videoIds)
      setHistory(entries)
    } catch (err) {
      console.error('Failed to remove from history:', err)
    }
  }, [])

  const clearAll = useCallback(async () => {
    try {
      await window.api.clearHistory()
      setHistory([])
    } catch (err) {
      console.error('Failed to clear history:', err)
    }
  }, [])

  return (
    <HistoryContext.Provider value={{ history, loading, addTrack, removeTracks, clearAll }}>
      {children}
    </HistoryContext.Provider>
  )
}
