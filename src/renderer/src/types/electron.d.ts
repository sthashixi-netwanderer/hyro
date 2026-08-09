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
  savePlayerState: (state: any) => Promise<{ success: boolean }>
  loadPlayerState: () => Promise<any>
  onTrayPlayerAction: (callback: (action: 'toggle-play' | 'next' | 'prev') => void) => () => void

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

  // Favorites (legacy)
  getFavorites: () => Promise<any[]>
  addFavorite: (item: { id: string; type: string; data: any }) => Promise<any[]>
  removeFavorite: (id: string, type: string) => Promise<any[]>
  isFavorited: (id: string, type: string) => Promise<boolean>

  // Liked Songs
  getLikedSongs: () => Promise<any[]>
  toggleLikedSong: (track: any) => Promise<{ tracks: any[]; added: boolean }>
  isLikedSong: (videoId: string) => Promise<boolean>
  addLikedSongs: (tracks: any[]) => Promise<any[]>
  removeLikedSong: (videoId: string) => Promise<any[]>
  removeLikedSongs: (videoIds: string[]) => Promise<any[]>
  reorderLikedSongs: (fromIndex: number, toIndex: number) => Promise<any[]>

  // Playlists
  getPlaylists: () => Promise<any[]>
  getPlaylistById: (id: string) => Promise<any>
  createPlaylist: (name: string, description?: string) => Promise<any>
  renamePlaylist: (id: string, name: string) => Promise<any>
  deletePlaylist: (id: string) => Promise<boolean>
  addTrackToPlaylist: (playlistId: string, track: any) => Promise<{ playlist: any; added: boolean }>
  addTracksToPlaylist: (playlistId: string, tracks: any[]) => Promise<{ playlist: any; addedCount: number }>
  removeTrackFromPlaylist: (playlistId: string, videoId: string) => Promise<any>
  reorderPlaylist: (playlistId: string, fromIndex: number, toIndex: number) => Promise<any>
  isTrackInPlaylist: (playlistId: string, videoId: string) => Promise<boolean>
  getPlaylistsContainingTrack: (videoId: string) => Promise<string[]>

  // Settings
  getSettings: () => Promise<{ groqApiKey: string; cookieBrowser: string; volume?: number; theme?: 'dark' | 'light' | 'system'; minimizeToTray?: boolean; maxConcurrentDownloads?: number }>
  saveSettings: (settings: { groqApiKey?: string; cookieBrowser?: string; volume?: number; theme?: 'dark' | 'light' | 'system'; minimizeToTray?: boolean; maxConcurrentDownloads?: number }) => Promise<{ success: boolean }>

  // Data Usage
  getDataUsage: () => Promise<import('../../../shared/types').DataUsageStats>
  recordDataUsage: (payload: { bytes: number; type?: 'stream' | 'cache' | 'download'; trackPlayed?: boolean }) => Promise<import('../../../shared/types').DataUsageStats>
  resetDataUsage: () => Promise<import('../../../shared/types').DataUsageStats>

  // Image Cache
  getCachedImageUrl: (url: string) => Promise<string>
  preCacheImages: (urls: string[]) => Promise<{ count: number }>

  // Artist Cache
  getCachedArtist: (artistId: string) => Promise<import('../../../shared/types').Artist | null>
  forceSyncArtist: (artistId: string) => Promise<import('../../../shared/types').Artist | null>

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

  // Logs
  getLogPath: () => Promise<string>
  readLogs: (maxBytes?: number) => Promise<string>
  clearLogs: () => Promise<{ success: boolean }>
  openLogFolder: () => Promise<{ success: boolean; path?: string; error?: string }>
  logToMain: (level: string, ...args: unknown[]) => Promise<{ success: boolean }>

  // Update
  checkForUpdate: () => Promise<{
    available: boolean
    version?: string
    body?: string
    htmlUrl?: string
  }>
  getAppVersion: () => Promise<string>
  downloadUpdate: (htmlUrl: string) => Promise<{ success: boolean; opened?: boolean; error?: string }>
  onUpdateAvailable: (callback: (data: { available: boolean; version?: string; body?: string; htmlUrl?: string }) => void) => () => void
  onUpdateDownloadProgress: (callback: (progress: number) => void) => () => void
}

declare interface Window {
  api: ElectronAPI
}
