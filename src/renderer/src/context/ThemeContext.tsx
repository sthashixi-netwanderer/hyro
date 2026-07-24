import { logger } from '../utils/logger'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light' | 'system'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'hyro-theme'

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function applyThemeClass(resolved: 'dark' | 'light') {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const cached = typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as Theme) : null
    return cached && ['dark', 'light', 'system'].includes(cached) ? cached : 'system'
  })

  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(getSystemTheme)

  // Listen for system media query changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Sync initial theme from main process settings once on load
  useEffect(() => {
    window.api.getSettings().then((settings) => {
      if (settings.theme && ['dark', 'light', 'system'].includes(settings.theme)) {
        setThemeState(settings.theme as Theme)
        localStorage.setItem(STORAGE_KEY, settings.theme)
      }
    }).catch((err) => {
      logger.error('Failed to load theme settings:', err)
    })
  }, [])

  // Derived resolved theme without state mutation loops
  const resolvedTheme: 'dark' | 'light' = theme === 'system' ? systemTheme : theme

  // Synchronously update HTML root class whenever resolvedTheme changes
  useEffect(() => {
    applyThemeClass(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)

    window.api.saveSettings({ theme: newTheme }).catch((err) => {
      logger.error('Failed to persist theme setting:', err)
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
