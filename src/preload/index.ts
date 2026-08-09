import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Music API
  search: (query: string) => ipcRenderer.invoke('music:search', query),
  getHomeSections: () => ipcRenderer.invoke('music:getHomeSections'),
  getSong: (videoId: string) => ipcRenderer.invoke('music:getSong', videoId),
  getAlbum: (albumId: string) => ipcRenderer.invoke('music:getAlbum', albumId),
  getPlaylist: (playlistId: string) => ipcRenderer.invoke('music:getPlaylist', playlistId),
  getArtist: (artistId: string) => ipcRenderer.invoke('music:getArtist', artistId),
  getUpNexts: (videoId: string) => ipcRenderer.invoke('music:getUpNexts', videoId),
  getSearchSuggestions: (query: string) => ipcRenderer.invoke('music:getSearchSuggestions', query),
  getLyrics: (videoId: string, trackName: string, artistName: string, albumName: string | null, duration: number | null, filePath?: string | null) =>
    ipcRenderer.invoke('music:getLyrics', videoId, trackName, artistName, albumName, duration, filePath),

  // Player
  getStreamUrl: (videoId: string) => ipcRenderer.invoke('player:getStreamUrl', videoId),
  savePlayerState: (state: any) => ipcRenderer.invoke('player-state:save', state),
  loadPlayerState: () => ipcRenderer.invoke('player-state:load'),
  onTrayPlayerAction: (callback: (action: 'toggle-play' | 'next' | 'prev') => void) => {
    const handler = (_event: any, action: 'toggle-play' | 'next' | 'prev'): void => callback(action)
    ipcRenderer.on('tray:player-action', handler)
    return () => {
      ipcRenderer.removeListener('tray:player-action', handler)
    }
  },
  
  // Download
  downloadTrack: (track: any) => ipcRenderer.invoke('download:track', track),
  downloadAlbum: (album: any, tracks: any[]) => ipcRenderer.invoke('download:album', album, tracks),
  downloadPlaylist: (playlist: any, tracks: any[]) => ipcRenderer.invoke('download:playlist', playlist, tracks),
  cancelDownload: (downloadId: string) => ipcRenderer.invoke('download:cancel', downloadId),
  saveDownloadQueue: (items: any[]) => ipcRenderer.invoke('download-queue:save', items),
  loadDownloadQueue: () => ipcRenderer.invoke('download-queue:load'),
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any): void => callback(data)
    ipcRenderer.on('download:progress', handler)
    return () => {
      ipcRenderer.removeListener('download:progress', handler)
    }
  },

  // Library
  getLibraryTracks: () => ipcRenderer.invoke('library:getTracks'),
  getLibraryContainers: () => ipcRenderer.invoke('library:getContainers'),
  getContainerTracks: (containerName: string) => ipcRenderer.invoke('library:getContainerTracks', containerName),
  deleteTrack: (filePath: string) => ipcRenderer.invoke('library:deleteTrack', filePath),
  deleteContainer: (containerPath: string) => ipcRenderer.invoke('library:deleteContainer', containerPath),
  getTrackPath: (videoId: string) => ipcRenderer.invoke('library:getTrackPath', videoId),

  // Stream Cache
  getStreamCachePath: (videoId: string) => ipcRenderer.invoke('stream-cache:getPath', videoId),
  preCacheTracks: (videoIds: string[]) => ipcRenderer.invoke('stream-cache:preCache', videoIds),
  cancelPreCache: (videoIds: string[]) => ipcRenderer.invoke('stream-cache:cancel', videoIds),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  addHistory: (track: any) => ipcRenderer.invoke('history:add', track),
  removeHistory: (videoIds: string[]) => ipcRenderer.invoke('history:remove', videoIds),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Favorites (legacy)
  getFavorites: () => ipcRenderer.invoke('favorites:get'),
  addFavorite: (item: { id: string; type: string; data: any }) => ipcRenderer.invoke('favorites:add', item),
  removeFavorite: (id: string, type: string) => ipcRenderer.invoke('favorites:remove', id, type),
  isFavorited: (id: string, type: string) => ipcRenderer.invoke('favorites:check', id, type),

  // Liked Songs
  getLikedSongs: () => ipcRenderer.invoke('liked-songs:get'),
  toggleLikedSong: (track: any) => ipcRenderer.invoke('liked-songs:toggle', track),
  isLikedSong: (videoId: string) => ipcRenderer.invoke('liked-songs:check', videoId),
  addLikedSongs: (tracks: any[]) => ipcRenderer.invoke('liked-songs:addTracks', tracks),
  removeLikedSong: (videoId: string) => ipcRenderer.invoke('liked-songs:remove', videoId),
  removeLikedSongs: (videoIds: string[]) => ipcRenderer.invoke('liked-songs:removeTracks', videoIds),
  reorderLikedSongs: (fromIndex: number, toIndex: number) => ipcRenderer.invoke('liked-songs:reorder', fromIndex, toIndex),

  // Playlists
  getPlaylists: () => ipcRenderer.invoke('playlists:get'),
  getPlaylistById: (id: string) => ipcRenderer.invoke('playlists:getById', id),
  createPlaylist: (name: string, description?: string) => ipcRenderer.invoke('playlists:create', name, description),
  renamePlaylist: (id: string, name: string) => ipcRenderer.invoke('playlists:rename', id, name),
  deletePlaylist: (id: string) => ipcRenderer.invoke('playlists:delete', id),
  addTrackToPlaylist: (playlistId: string, track: any) => ipcRenderer.invoke('playlists:addTrack', playlistId, track),
  addTracksToPlaylist: (playlistId: string, tracks: any[]) => ipcRenderer.invoke('playlists:addTracks', playlistId, tracks),
  removeTrackFromPlaylist: (playlistId: string, videoId: string) => ipcRenderer.invoke('playlists:removeTrack', playlistId, videoId),
  reorderPlaylist: (playlistId: string, fromIndex: number, toIndex: number) => ipcRenderer.invoke('playlists:reorder', playlistId, fromIndex, toIndex),
  isTrackInPlaylist: (playlistId: string, videoId: string) => ipcRenderer.invoke('playlists:containsTrack', playlistId, videoId),
  getPlaylistsContainingTrack: (videoId: string) => ipcRenderer.invoke('playlists:containingTrack', videoId),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { groqApiKey?: string; cookieBrowser?: string; volume?: number; minimizeToTray?: boolean; maxConcurrentDownloads?: number }) => ipcRenderer.invoke('settings:save', settings),

  // Data Usage
  getDataUsage: () => ipcRenderer.invoke('data-usage:get'),
  recordDataUsage: (payload: { bytes: number; type?: 'stream' | 'cache' | 'download'; trackPlayed?: boolean }) =>
    ipcRenderer.invoke('data-usage:record', payload),
  resetDataUsage: () => ipcRenderer.invoke('data-usage:reset'),

  // Window Fullscreen controls
  setFullScreen: (flag: boolean) => ipcRenderer.invoke('window:setFullScreen', flag),
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => {
    const handler = (_event: any, isFullScreen: boolean): void => callback(isFullScreen)
    ipcRenderer.on('window:fullscreen-changed', handler)
    return () => {
      ipcRenderer.removeListener('window:fullscreen-changed', handler)
    }
  },

  // Image Cache
  getCachedImageUrl: (url: string) => ipcRenderer.invoke('image-cache:get', url),
  preCacheImages: (urls: string[]) => ipcRenderer.invoke('image-cache:preCache', urls),

  // Artist Cache
  getCachedArtist: (artistId: string) => ipcRenderer.invoke('artist-cache:get', artistId),
  forceSyncArtist: (artistId: string) => ipcRenderer.invoke('artist-cache:getSynced', artistId),

  // yt-dlp
  getYtDlpVersion: () => ipcRenderer.invoke('ytdlp:getVersion'),
  checkYtDlpUpdate: () => ipcRenderer.invoke('ytdlp:checkUpdate'),
  updateYtDlp: () => ipcRenderer.invoke('ytdlp:update'),

  // Update
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  getAppVersion: () => ipcRenderer.invoke('update:getVersion'),
  downloadUpdate: (htmlUrl: string) => ipcRenderer.invoke('update:download', htmlUrl),
  onUpdateAvailable: (callback: (data: { available: boolean; version?: string; body?: string; htmlUrl?: string }) => void) => {
    const handler = (_event: any, data: any): void => callback(data)
    ipcRenderer.on('update:available', handler)
    return () => {
      ipcRenderer.removeListener('update:available', handler)
    }
  },
  onUpdateDownloadProgress: (callback: (progress: number) => void) => {
    const handler = (_event: any, progress: number): void => callback(progress)
    ipcRenderer.on('update:download-progress', handler)
    return () => {
      ipcRenderer.removeListener('update:download-progress', handler)
    }
  },

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Logs
  getLogPath: () => ipcRenderer.invoke('log:getPath'),
  readLogs: (maxBytes?: number) => ipcRenderer.invoke('log:read', maxBytes),
  clearLogs: () => ipcRenderer.invoke('log:clear'),
  openLogFolder: () => ipcRenderer.invoke('log:open'),
  logToMain: (level: string, ...args: unknown[]) => ipcRenderer.invoke('log:renderer', level, ...args),

  // Window Custom controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
