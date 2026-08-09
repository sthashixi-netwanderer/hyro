import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { PlayerProvider } from './context/PlayerContext'
import { DownloadProvider } from './context/DownloadContext'
import { HistoryProvider } from './context/HistoryContext'
import { FavoritesProvider } from './context/FavoritesContext'
import { LikedSongsProvider } from './context/LikedSongsContext'
import { PlaylistsProvider } from './context/PlaylistsContext'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PlayerProvider>
        <DownloadProvider>
          <HistoryProvider>
            <FavoritesProvider>
              <LikedSongsProvider>
                <PlaylistsProvider>
                  <App />
                </PlaylistsProvider>
              </LikedSongsProvider>
            </FavoritesProvider>
          </HistoryProvider>
        </DownloadProvider>
      </PlayerProvider>
    </ThemeProvider>
  </React.StrictMode>
)
