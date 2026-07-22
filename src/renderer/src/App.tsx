import { useState, useEffect } from 'react'
import type { ViewType } from '../../shared/types'
import { NavigationProvider } from './context/NavigationContext'
import Sidebar from './components/Sidebar/Sidebar'
import Home from './components/Home/Home'
import Search from './components/Search/Search'
import Queue from './components/Queue/Queue'
import AlbumDetail from './components/AlbumDetail/AlbumDetail'
import PlaylistDetail from './components/PlaylistDetail/PlaylistDetail'
import ArtistDetail from './components/ArtistDetail/ArtistDetail'
import Library from './components/Library/Library'
import ContainerDetail from './components/Library/ContainerDetail'
import History from './components/History/History'
import Favorites from './components/Favorites/Favorites'
import Settings from './components/Settings/Settings'
import Downloads from './components/Downloads/Downloads'
import Player from './components/Player/Player'
import DownloadPopup from './components/Downloads/DownloadPopup'
import TitleBar from './components/TitleBar/TitleBar'

export default function App() {
  const [view, setView] = useState<ViewType>('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewData, setViewData] = useState<string | null>(null)
  const [navHistory, setNavHistory] = useState<{ view: ViewType; data: string | null }[]>([
    { view: 'home', data: null }
  ])
  const [isFullScreen, setIsFullScreen] = useState(false)

  useEffect(() => {
    const removeListener = window.api.onFullScreenChange((fs) => {
      setIsFullScreen(fs)
    })
    return removeListener
  }, [])

  function navigateTo(type: ViewType, id?: string) {
    const data = id || null
    setView(type)
    setViewData(data)
    setNavHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.view === type && last.data === data) {
        return prev
      }
      return [...prev, { view: type, data }]
    })
  }

  function navigateBack() {
    setNavHistory((prev) => {
      if (prev.length <= 1) return prev
      const updated = prev.slice(0, -1)
      const prevStep = updated[updated.length - 1]
      setView(prevStep.view)
      setViewData(prevStep.data)
      return updated
    })
  }

  const renderView = () => {
    switch (view) {
      case 'home':
        return <Home onNavigate={navigateTo} />
      case 'search':
        return <Search initialQuery={searchQuery} onNavigate={navigateTo} />
      case 'queue':
        return <Queue />
      case 'album':
        return viewData ? (
          <AlbumDetail albumId={viewData} onBack={navigateBack} />
        ) : (
          <Home onNavigate={navigateTo} />
        )
      case 'playlist':
        return viewData ? (
          <PlaylistDetail playlistId={viewData} onBack={navigateBack} />
        ) : (
          <Home onNavigate={navigateTo} />
        )
      case 'artist':
        return viewData ? (
          <ArtistDetail artistId={viewData} onBack={navigateBack} />
        ) : (
          <Home onNavigate={navigateTo} />
        )
      case 'library':
        return <Library onNavigate={navigateTo} />
      case 'libraryContainer':
        return viewData ? (
          <ContainerDetail containerName={viewData} onBack={navigateBack} />
        ) : (
          <Library onNavigate={navigateTo} />
        )
      case 'history':
        return <History />
      case 'favorites':
        return <Favorites />
      case 'settings':
        return <Settings />
      case 'downloads':
        return <Downloads />
      default:
        return <Home onNavigate={navigateTo} />
    }
  }

  return (
    <NavigationProvider navigateTo={navigateTo}>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {!isFullScreen && <TitleBar />}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar currentView={view} currentViewData={viewData} onNavigate={(v, id) => navigateTo(v, id)} />
          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto">
              {renderView()}
            </div>
            <Player />
          </main>
          <DownloadPopup />
        </div>
      </div>
    </NavigationProvider>
  )
}
