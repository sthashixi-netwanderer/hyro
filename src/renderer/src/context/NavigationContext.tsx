import { createContext, useContext, type ReactNode } from 'react'
import type { ViewType } from '../../../shared/types'

interface NavigationContextType {
  navigateTo: (type: ViewType, id?: string) => void
}

const NavigationContext = createContext<NavigationContextType | null>(null)

export function useNavigation(): NavigationContextType {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}

interface NavigationProviderProps {
  navigateTo: (type: ViewType, id?: string) => void
  children: ReactNode
}

export function NavigationProvider({ navigateTo, children }: NavigationProviderProps) {
  return (
    <NavigationContext.Provider value={{ navigateTo }}>
      {children}
    </NavigationContext.Provider>
  )
}
