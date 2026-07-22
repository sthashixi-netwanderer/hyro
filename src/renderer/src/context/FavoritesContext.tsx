import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { FavoriteItem } from '../../../shared/types'

interface FavoritesContextType {
  favorites: FavoriteItem[]
  loading: boolean
  isFavorited: (id: string, type: FavoriteItem['type']) => boolean
  toggleFavorite: (id: string, type: FavoriteItem['type'], data: any) => Promise<void>
  updateFavorite: (id: string, type: FavoriteItem['type'], data: any) => Promise<void>
  refresh: () => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextType | null>(null)

export function useFavorites(): FavoritesContextType {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider')
  return ctx
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFavorites()
  }, [])

  async function loadFavorites() {
    try {
      const items = await window.api.getFavorites()
      setFavorites(items)
    } catch (err) {
      console.error('Failed to load favorites:', err)
    } finally {
      setLoading(false)
    }
  }

  const isFavorited = useCallback((id: string, type: FavoriteItem['type']) => {
    return favorites.some(f => f.id === id && f.type === type)
  }, [favorites])

  const toggleFavorite = useCallback(async (id: string, type: FavoriteItem['type'], data: any) => {
    const exists = favorites.some(f => f.id === id && f.type === type)
    try {
      if (exists) {
        const items = await window.api.removeFavorite(id, type)
        setFavorites(items)
      } else {
        const items = await window.api.addFavorite({ id, type, data })
        setFavorites(items)
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }, [favorites])

  const updateFavorite = useCallback(async (id: string, type: FavoriteItem['type'], data: any) => {
    try {
      const exists = favorites.some(f => f.id === id && f.type === type)
      if (exists) {
        const items = await window.api.addFavorite({ id, type, data })
        setFavorites(items)
      }
    } catch (err) {
      console.error('Failed to update favorite data:', err)
    }
  }, [favorites])

  const refresh = useCallback(async () => {
    await loadFavorites()
  }, [])

  return (
    <FavoritesContext.Provider value={{ favorites, loading, isFavorited, toggleFavorite, updateFavorite, refresh }}>
      {children}
    </FavoritesContext.Provider>
  )
}
