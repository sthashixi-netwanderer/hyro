export interface Thumbnail {
  url: string
  width: number
  height: number
}

export interface ArtistBasic {
  artistId: string | null
  name: string
}

export interface AlbumBasic {
  albumId: string
  name: string
}

export interface Track {
  videoId: string
  name: string
  artist: ArtistBasic
  artists?: ArtistBasic[]
  album: AlbumBasic | null
  duration: number | null
  thumbnails: Thumbnail[]
  type: 'SONG' | 'VIDEO'
  filePath?: string | null
  thumbnailPath?: string | null
}

export interface Album {
  albumId: string
  playlistId: string
  name: string
  artist: ArtistBasic
  artists?: ArtistBasic[]
  year: number | null
  thumbnails: Thumbnail[]
  type: 'ALBUM'
  songs?: Track[]
}

export interface Playlist {
  playlistId: string
  name: string
  artist: ArtistBasic
  artists?: ArtistBasic[]
  thumbnails: Thumbnail[]
  type: 'PLAYLIST'
  videoCount?: number
  videos?: Track[]
}

export interface Artist {
  artistId: string
  name: string
  thumbnails: Thumbnail[]
  type: 'ARTIST'
  subscribers?: string
  songs?: Track[]
  albums?: Album[]
  singles?: Album[]
  similarArtists?: Artist[]
}

export interface HomeSection {
  title: string
  contents: (Track | Album | Playlist)[]
}

export interface SearchResults {
  songs: Track[]
  artists: Artist[]
  albums: Album[]
  playlists: Playlist[]
}

export interface PlayerState {
  currentTrack: Track | null
  queue: Track[]
  originalQueue: Track[]
  queueIndex: number
  isPlaying: boolean
  isShuffled: boolean
  repeatMode: 'off' | 'all' | 'one'
  volume: number
  currentTime: number
  duration: number
  isMuted: boolean
}

export type ViewType = 'home' | 'search' | 'queue' | 'album' | 'playlist' | 'artist' | 'library' | 'libraryContainer' | 'history' | 'favorites' | 'settings' | 'downloads'

export interface DownloadedTrack extends Track {
  filePath: string
  thumbnailPath: string | null
  downloadedAt: string
  container: string
  containerType: 'artist' | 'album' | 'playlist' | 'single'
}

export interface LibraryContainer {
  name: string
  type: 'artist' | 'album' | 'playlist' | 'single'
  trackCount: number
  thumbnailPath: string | null
  thumbnails: Thumbnail[]
  tracks: DownloadedTrack[]
}

export interface FavoriteItem {
  id: string
  type: 'track' | 'album' | 'playlist' | 'artist'
  data: any
  addedAt: string
}
