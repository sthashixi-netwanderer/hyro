interface ElectronAPI {
  // Music API
  search: (query: string) => Promise<{
    songs: any[]
    artists: any[]
    albums: any[]
    playlists: any[]
  }>
  getHomeSections: () => Promise<any[]>
  getSong: (videoId: string) => Promise<any>
  getAlbum: (albumId: string) => Promise<any>
  getPlaylist: (playlistId: string) => Promise<any>
  getArtist: (artistId: string) => Promise<any>
  getUpNexts: (videoId: string) => Promise<any[]>
  getSearchSuggestions: (query: string) => Promise<string[]>
  getLyrics: (videoId: string, trackName: string, artistName: string, albumName: string | null, duration: number | null, filePath?: string | null) => Promise<{ plain: string[]; synced: { time: number; text: string }[]; provider?: string } | null>

  // Player
  getStreamUrl: (videoId: string) => Promise<string>

  // Download
  downloadTrack: (track: any) => Promise<{ success: boolean; error?: string }>
  downloadAlbum: (album: any, tracks: any[]) => Promise<{ success: boolean; error?: string }>
  downloadPlaylist: (playlist: any, tracks: any[]) => Promise<{ success: boolean; error?: string }>
  cancelDownload: (downloadId: string) => Promise<{ success: boolean; error?: string }>
  saveDownloadQueue: (items: any[]) => Promise<{ success: boolean }>
  loadDownloadQueue: () => Promise<any[]>
  onDownloadProgress: (callback: (data: {
    id: string
    type: 'track' | 'album' | 'playlist'
    progress: number
    status: 'downloading' | 'done' | 'error' | 'cancelled'
    error?: string
    trackIndex?: number
    totalTracks?: number
    trackName?: string
  }) => void) => () => void

  // Library
  getLibraryTracks: () => Promise<any[]>
  getLibraryContainers: () => Promise<any[]>
  getContainerTracks: (containerName: string) => Promise<any[]>
  deleteTrack: (filePath: string) => Promise<{ success: boolean; error?: string }>
  deleteContainer: (containerPath: string) => Promise<{ success: boolean; error?: string }>
  getTrackPath: (videoId: string) => Promise<string | null>

  // Stream Cache
  getStreamCachePath: (videoId: string) => Promise<string | null>
  preCacheTracks: (videoIds: string[]) => Promise<{ success: boolean }>
  cancelPreCache: (videoIds: string[]) => Promise<{ success: boolean }>

  // History
  getHistory: () => Promise<any[]>
  addHistory: (track: any) => Promise<any[]>
  removeHistory: (videoIds: string[]) => Promise<any[]>
  clearHistory: () => Promise<{ success: boolean }>

  // Favorites
  getFavorites: () => Promise<any[]>
  addFavorite: (item: { id: string; type: string; data: any }) => Promise<any[]>
  removeFavorite: (id: string, type: string) => Promise<any[]>
  isFavorited: (id: string, type: string) => Promise<boolean>

  // Settings
  getSettings: () => Promise<{ groqApiKey: string; cookieBrowser: string; volume?: number }>
  saveSettings: (settings: { groqApiKey?: string; cookieBrowser?: string; volume?: number }) => Promise<{ success: boolean }>

  // Window Fullscreen controls
  setFullScreen: (flag: boolean) => Promise<boolean>
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => () => void

  // Shell
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>

  // Window Custom controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>

  // yt-dlp
  getYtDlpVersion: () => Promise<{ installed: boolean; version: string | null }>
  checkYtDlpUpdate: () => Promise<{
    installed: boolean
    currentVersion: string | null
    latestVersion: string | null
    releaseUrl: string | null
    updateAvailable: boolean
    installMethod: 'pip' | 'pipx' | 'homebrew' | 'standalone'
  }>
  updateYtDlp: () => Promise<{
    success: boolean
    version: string | null
    message: string
    error?: string
  }>
}

declare interface Window {
  api: ElectronAPI
}
