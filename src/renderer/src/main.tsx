import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PlayerProvider } from './context/PlayerContext'
import { DownloadProvider } from './context/DownloadContext'
import { HistoryProvider } from './context/HistoryContext'
import { FavoritesProvider } from './context/FavoritesContext'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlayerProvider>
      <DownloadProvider>
        <HistoryProvider>
          <FavoritesProvider>
            <App />
          </FavoritesProvider>
        </HistoryProvider>
      </DownloadProvider>
    </PlayerProvider>
  </React.StrictMode>
)
