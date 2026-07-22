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

  // Favorites
  getFavorites: () => ipcRenderer.invoke('favorites:get'),
  addFavorite: (item: { id: string; type: string; data: any }) => ipcRenderer.invoke('favorites:add', item),
  removeFavorite: (id: string, type: string) => ipcRenderer.invoke('favorites:remove', id, type),
  isFavorited: (id: string, type: string) => ipcRenderer.invoke('favorites:check', id, type),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { groqApiKey?: string; cookieBrowser?: string; volume?: number }) => ipcRenderer.invoke('settings:save', settings),

  // Window Fullscreen controls
  setFullScreen: (flag: boolean) => ipcRenderer.invoke('window:setFullScreen', flag),
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => {
    const handler = (_event: any, isFullScreen: boolean): void => callback(isFullScreen)
    ipcRenderer.on('window:fullscreen-changed', handler)
    return () => {
      ipcRenderer.removeListener('window:fullscreen-changed', handler)
    }
  },

  // yt-dlp
  getYtDlpVersion: () => ipcRenderer.invoke('ytdlp:getVersion'),
  checkYtDlpUpdate: () => ipcRenderer.invoke('ytdlp:checkUpdate'),
  updateYtDlp: () => ipcRenderer.invoke('ytdlp:update'),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

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
