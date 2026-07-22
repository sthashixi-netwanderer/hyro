import { useState, useEffect, useRef } from 'react'
import type { Track, Artist, Album, Playlist, SearchResults, ViewType, HomeSection } from '../../../../shared/types'
import { bestThumbnailUrl } from '../../../../shared/utils'
import { usePlayer } from '../../context/PlayerContext'
import { useFavorites } from '../../context/FavoritesContext'
import { useDownload } from '../../context/DownloadContext'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import FavoriteButton from '@/components/ui/FavoriteButton'
import {
  Search as SearchIcon,
  X,
  Music,
  Disc3,
  ListMusic,
  User,
  Clock,
  Play,
  ListPlus,
  Heart,
  Download,
  Plus,
  Check,
  ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchProps {
  initialQuery?: string
  onNavigate: (type: ViewType, id?: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  item: Track | Album | Playlist | Artist
  itemType: 'track' | 'album' | 'playlist' | 'artist'
}

export default function Search({ initialQuery = '', onNavigate }: SearchProps) {
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [recommendations, setRecommendations] = useState<HomeSection[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { playTrack, addToQueue } = usePlayer()
  const { isFavorited, toggleFavorite } = useFavorites()
  const { downloadTrack, downloadAlbum, downloadPlaylist } = useDownload()

  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showRecent, setShowRecent] = useState(false)

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  // Close context menu on outside click, scroll, or Escape
  useEffect(() => {
    function handleClickOutside() {
      setContextMenu(null)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('click', handleClickOutside)
    window.addEventListener('scroll', handleClickOutside, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('scroll', handleClickOutside, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function handleRemoveRecent(qToRemove: string) {
    setRecentSearches((prev) => {
      const updated = prev.filter((q) => q !== qToRemove)
      localStorage.setItem('recentSearches', JSON.stringify(updated))
      return updated
    })
  }

  // Load recommendations when no search is active
  useEffect(() => {
    if (!results && !loading) {
      window.api.getHomeSections().then(setRecommendations).catch(console.error)
    }
  }, [results, loading])

  useEffect(() => {
    if (query.length > 1) {
      const timer = setTimeout(async () => {
        try {
          const s = await window.api.getSearchSuggestions(query)
          setSuggestions(s)
        } catch {
          setSuggestions([])
        }
      }, 300)
      return () => clearTimeout(timer)
    }
    setSuggestions([])
  }, [query])

  async function handleSearch(searchQuery: string) {
    if (!searchQuery.trim()) return
    const trimmed = searchQuery.trim()
    setLoading(true)
    setShowSuggestions(false)
    setShowRecent(false)

    setRecentSearches((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())
      const updated = [trimmed, ...filtered].slice(0, 20)
      localStorage.setItem('recentSearches', JSON.stringify(updated))
      return updated
    })

    try {
      const data = await window.api.search(trimmed)
      setResults(data)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch(query)
    }
  }

  function handlePlayTrack(track: Track) {
    const allTracks = results?.songs || []
    playTrack(track, allTracks.length > 0 ? allTracks : [track])
  }

  function formatDuration(seconds: number): string {
    const num = Number(seconds)
    if (!num || isNaN(num)) return ''
    const mins = Math.floor(num / 60)
    const secs = Math.floor(num % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function handleContextMenu(
    e: React.MouseEvent,
    item: Track | Album | Playlist | Artist,
    itemType: 'track' | 'album' | 'playlist' | 'artist'
  ) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      itemType
    })
  }

  async function handleDownloadAlbumItem(album: Album) {
    try {
      const albumData = await window.api.getAlbum(album.albumId)
      if (albumData?.songs) {
        downloadAlbum(album, albumData.songs)
      }
    } catch (err) {
      console.error('Failed to download album:', err)
    }
  }

  async function handleDownloadPlaylistItem(pl: Playlist) {
    try {
      const plData = await window.api.getPlaylist(pl.playlistId)
      if (plData?.videos) {
        downloadPlaylist(pl, plData.videos)
      }
    } catch (err) {
      console.error('Failed to download playlist:', err)
    }
  }

  const menuX = contextMenu ? Math.min(contextMenu.x, window.innerWidth - 230) : 0
  const menuY = contextMenu ? Math.min(contextMenu.y, window.innerHeight - 300) : 0

  return (
    <div className="p-8">
      <div className="flex gap-2 max-w-xl mb-8 relative">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            className="pl-10 pr-10 h-11 bg-muted border-0 text-base placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring w-full"
            placeholder="Search for songs, artists, albums..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDownInput}
            onFocus={() => {
              setShowSuggestions(true)
              setShowRecent(true)
            }}
            onBlur={() => {
              setTimeout(() => {
                setShowSuggestions(false)
                setShowRecent(false)
              }, 200)
            }}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setQuery('')
                setResults(null)
                setSuggestions([])
                inputRef.current?.focus()
              }}
            >
              <X className="size-4" />
            </Button>
          )}

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors flex items-center gap-2"
                  onMouseDown={() => {
                    setQuery(suggestion)
                    handleSearch(suggestion)
                  }}
                >
                  <SearchIcon className="size-3.5 text-muted-foreground" />
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Recent Searches */}
          {showRecent && !query && recentSearches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2.5 text-xs font-semibold text-muted-foreground border-b border-border flex justify-between items-center bg-accent/20 select-none">
                <span>Recent Searches</span>
                <button
                  className="text-primary hover:underline text-[10px]"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setRecentSearches([])
                    localStorage.removeItem('recentSearches')
                  }}
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-[200px] overflow-y-auto divide-y divide-border/40">
                {recentSearches.map((s, i) => (
                  <div
                    key={i}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent cursor-pointer group transition-colors"
                    onMouseDown={() => {
                      setQuery(s)
                      handleSearch(s)
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Clock className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-white/95 truncate select-none">{s}</span>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-white rounded-full hover:bg-white/10 transition-all"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleRemoveRecent(s)
                      }}
                      title="Remove"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button
          onClick={() => handleSearch(query)}
          className="h-11 px-5 bg-primary hover:bg-primary/95 text-white font-medium rounded-lg shrink-0"
        >
          Search
        </Button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <p className="text-muted-foreground text-sm">Searching...</p>
        </div>
      )}

      {results && !loading && (
        <div className="space-y-8">
          {results.songs.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-3">Songs</h3>
              <div className="space-y-1">
                {results.songs.map((track) => (
                  <div
                    key={track.videoId}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                    onClick={() => handlePlayTrack(track)}
                    onContextMenu={(e) => handleContextMenu(e, track, 'track')}
                  >
                    <div className="w-11 h-11 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {bestThumbnailUrl(track.thumbnails) ? (
                        <img src={bestThumbnailUrl(track.thumbnails)} alt={track.name} className="w-full h-full object-cover" />
                      ) : (
                        <Music className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{track.name}</p>
                      <span className="text-xs text-muted-foreground truncate block">
                        {track.artists && track.artists.length > 0 ? (
                          track.artists.map((art, artIdx) => (
                            <span key={art.artistId || art.name}>
                              {artIdx > 0 && <span className="cursor-default select-none">, </span>}
                              <span
                                className={cn(
                                  art.artistId && 'hover:underline cursor-pointer hover:text-foreground transition-colors'
                                )}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  if (art.artistId) onNavigate('artist', art.artistId)
                                }}
                              >
                                {art.name}
                              </span>
                            </span>
                          ))
                        ) : (
                          <span
                            className={cn(
                              track.artist?.artistId && 'hover:underline cursor-pointer hover:text-foreground transition-colors'
                            )}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              if (track.artist?.artistId) onNavigate('artist', track.artist.artistId)
                            }}
                          >
                            {track.artist?.name || ''}
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {track.duration ? formatDuration(track.duration) : ''}
                    </span>
                    <FavoriteButton
                      id={track.videoId}
                      type="track"
                      data={track}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.artists.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-3">Artists</h3>
              <div className="flex flex-wrap gap-3">
                {results.artists.map((artist) => (
                  <div
                    key={artist.artistId}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                    onClick={() => onNavigate('artist', artist.artistId)}
                    onContextMenu={(e) => handleContextMenu(e, artist, 'artist')}
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {bestThumbnailUrl(artist.thumbnails) ? (
                        <img src={bestThumbnailUrl(artist.thumbnails)} alt={artist.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{artist.name}</p>
                      <p className="text-xs text-muted-foreground">Artist</p>
                    </div>
                    <FavoriteButton
                      id={artist.artistId}
                      type="artist"
                      data={artist}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.albums.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-3">Albums</h3>
              <div className="space-y-1">
                {results.albums.map((album) => (
                  <div
                    key={album.albumId}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                    onDoubleClick={() => onNavigate('album', album.albumId)}
                    onContextMenu={(e) => handleContextMenu(e, album, 'album')}
                  >
                    <div className="w-11 h-11 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {bestThumbnailUrl(album.thumbnails) ? (
                        <img src={bestThumbnailUrl(album.thumbnails)} alt={album.name} className="w-full h-full object-cover" />
                      ) : (
                        <Disc3 className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{album.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        <span
                          className="hover:underline cursor-pointer"
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            if (album.artist?.artistId) onNavigate('artist', album.artist.artistId)
                          }}
                        >
                          {album.artist?.name}
                        </span>
                        {album.year ? ` \u00B7 ${album.year}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.playlists.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-3">Playlists</h3>
              <div className="space-y-1">
                {results.playlists.map((pl) => (
                  <div
                    key={pl.playlistId}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                    onDoubleClick={() => onNavigate('playlist', pl.playlistId)}
                    onContextMenu={(e) => handleContextMenu(e, pl, 'playlist')}
                  >
                    <div className="w-11 h-11 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {bestThumbnailUrl(pl.thumbnails) ? (
                        <img src={bestThumbnailUrl(pl.thumbnails)} alt={pl.name} className="w-full h-full object-cover" />
                      ) : (
                        <ListMusic className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pl.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {pl.artist?.artistId ? (
                          <span
                            className="hover:underline cursor-pointer"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              onNavigate('artist', pl.artist!.artistId!)
                            }}
                          >
                            {pl.artist?.name || 'Playlist'}
                          </span>
                        ) : (
                          pl.artist?.name || 'Playlist'
                        )}
                        {pl.videoCount != null && ` \u00B7 ${pl.videoCount} songs`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.songs.length === 0 &&
            results.artists.length === 0 &&
            results.albums.length === 0 &&
            results.playlists.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <SearchIcon className="size-12 mb-4" />
                <p>No results found for &quot;{query}&quot;</p>
              </div>
            )}
        </div>
      )}

      {!results && !loading && (
        <div>
          {recommendations.length > 0 ? (
            <div>
              <h2 className="text-lg font-bold mb-4">Recommended for you</h2>
              {recommendations.map((section, sIdx) => {
                const sectionTracks = section.contents.filter(
                  (item): item is Track => 'videoId' in item
                )
                return (
                  <section key={sIdx} className="mb-8">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{section.title}</h3>
                    <div className="section-scroll">
                      {section.contents.map((item, idx) => {
                        if ('videoId' in item) {
                          return (
                            <Card
                              key={`${item.videoId}-${idx}`}
                              className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
                              onClick={() => playTrack(item, sectionTracks)}
                              onContextMenu={(e) => handleContextMenu(e, item, 'track')}
                            >
                              <CardContent className="p-0 relative">
                                <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
                                  {bestThumbnailUrl(item.thumbnails) ? (
                                    <img src={bestThumbnailUrl(item.thumbnails)} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Music className="size-8 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <FavoriteButton id={item.videoId} type="track" data={item} size="md" className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm" />
                                </div>
                                <div className="px-3 py-3">
                                  <p className="text-sm font-medium truncate">{item.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{item.artist?.name}</p>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        }
                        if ('albumId' in item) {
                          return (
                            <Card
                              key={`${item.albumId}-${idx}`}
                              className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
                              onDoubleClick={() => onNavigate('album', item.albumId)}
                              onContextMenu={(e) => handleContextMenu(e, item, 'album')}
                            >
                              <CardContent className="p-0 relative">
                                <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
                                  {bestThumbnailUrl(item.thumbnails) ? (
                                    <img src={bestThumbnailUrl(item.thumbnails)} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Disc3 className="size-8 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <FavoriteButton id={item.albumId} type="album" data={item} size="md" className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm" />
                                </div>
                                <div className="px-3 py-3">
                                  <p className="text-sm font-medium truncate">{item.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{item.artist?.name}</p>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        }
                        if ('playlistId' in item) {
                          return (
                            <Card
                              key={`${item.playlistId}-${idx}`}
                              className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
                              onDoubleClick={() => onNavigate('playlist', item.playlistId)}
                              onContextMenu={(e) => handleContextMenu(e, item, 'playlist')}
                            >
                              <CardContent className="p-0 relative">
                                <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
                                  {bestThumbnailUrl(item.thumbnails) ? (
                                    <img src={bestThumbnailUrl(item.thumbnails)} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <ListMusic className="size-8 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <FavoriteButton id={item.playlistId} type="playlist" data={item} size="md" className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm" />
                                </div>
                                <div className="px-3 py-3">
                                  <p className="text-sm font-medium truncate">{item.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {item.videoCount != null ? `${item.videoCount} songs` : 'Playlist'}
                                  </p>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        }
                        return null
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <SearchIcon className="size-12 mb-4" />
              <p>Search for your favorite music</p>
            </div>
          )}
        </div>
      )}

      {/* Floating Context Menu Overlay */}
      {contextMenu && (
        <div
          className="fixed z-50 w-56 bg-popover/95 backdrop-blur-md border border-border/80 rounded-xl shadow-2xl p-1.5 text-popover-foreground text-sm animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ top: menuY, left: menuX }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground border-b border-border/50 mb-1 truncate">
            {'name' in contextMenu.item ? contextMenu.item.name : 'Options'}
          </div>

          {/* Context Options for Tracks */}
          {contextMenu.itemType === 'track' && (() => {
            const track = contextMenu.item as Track
            const fav = isFavorited(track.videoId, 'track')
            return (
              <>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    handlePlayTrack(track)
                    setContextMenu(null)
                  }}
                >
                  <Play className="size-3.5 text-primary fill-current" />
                  Play Song
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    addToQueue(track)
                    setContextMenu(null)
                  }}
                >
                  <ListPlus className="size-3.5 text-muted-foreground" />
                  Add to Queue
                </button>
                {track.artist?.artistId && (
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                    onClick={() => {
                      onNavigate('artist', track.artist.artistId || undefined)
                      setContextMenu(null)
                    }}
                  >
                    <User className="size-3.5 text-primary" />
                    Go to Artist ({track.artist.name})
                  </button>
                )}
                {track.album?.albumId && (
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                    onClick={() => {
                      onNavigate('album', track.album!.albumId)
                      setContextMenu(null)
                    }}
                  >
                    <Disc3 className="size-3.5 text-primary" />
                    Go to Album ({track.album.name})
                  </button>
                )}
                <div className="h-px bg-border/50 my-1" />
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    toggleFavorite(track.videoId, 'track', track)
                    setContextMenu(null)
                  }}
                >
                  <Heart className={cn('size-3.5', fav ? 'text-primary fill-primary' : 'text-muted-foreground')} />
                  {fav ? 'Remove Favorite' : 'Save to Favorites'}
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    downloadTrack(track)
                    setContextMenu(null)
                  }}
                >
                  <Download className="size-3.5 text-muted-foreground" />
                  Download Track
                </button>
              </>
            )
          })()}

          {/* Context Options for Albums */}
          {contextMenu.itemType === 'album' && (() => {
            const album = contextMenu.item as Album
            const fav = isFavorited(album.albumId, 'album')
            return (
              <>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    onNavigate('album', album.albumId)
                    setContextMenu(null)
                  }}
                >
                  <Disc3 className="size-3.5 text-primary" />
                  Go to Album
                </button>
                {album.artist?.artistId && (
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                    onClick={() => {
                      onNavigate('artist', album.artist.artistId || undefined)
                      setContextMenu(null)
                    }}
                  >
                    <User className="size-3.5 text-primary" />
                    Go to Artist ({album.artist.name})
                  </button>
                )}
                <div className="h-px bg-border/50 my-1" />
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    toggleFavorite(album.albumId, 'album', album)
                    setContextMenu(null)
                  }}
                >
                  <Heart className={cn('size-3.5', fav ? 'text-primary fill-primary' : 'text-muted-foreground')} />
                  {fav ? 'Remove Favorite' : 'Save to Favorites'}
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    handleDownloadAlbumItem(album)
                    setContextMenu(null)
                  }}
                >
                  <Download className="size-3.5 text-muted-foreground" />
                  Download Album
                </button>
              </>
            )
          })()}

          {/* Context Options for Playlists */}
          {contextMenu.itemType === 'playlist' && (() => {
            const playlist = contextMenu.item as Playlist
            const fav = isFavorited(playlist.playlistId, 'playlist')
            return (
              <>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    onNavigate('playlist', playlist.playlistId)
                    setContextMenu(null)
                  }}
                >
                  <ListMusic className="size-3.5 text-primary" />
                  Go to Playlist
                </button>
                {playlist.artist?.artistId && (
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                    onClick={() => {
                      onNavigate('artist', playlist.artist.artistId || undefined)
                      setContextMenu(null)
                    }}
                  >
                    <User className="size-3.5 text-primary" />
                    Go to Artist ({playlist.artist.name})
                  </button>
                )}
                <div className="h-px bg-border/50 my-1" />
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    toggleFavorite(playlist.playlistId, 'playlist', playlist)
                    setContextMenu(null)
                  }}
                >
                  <Heart className={cn('size-3.5', fav ? 'text-primary fill-primary' : 'text-muted-foreground')} />
                  {fav ? 'Remove Favorite' : 'Save to Favorites'}
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    handleDownloadPlaylistItem(playlist)
                    setContextMenu(null)
                  }}
                >
                  <Download className="size-3.5 text-muted-foreground" />
                  Download Playlist
                </button>
              </>
            )
          })()}

          {/* Context Options for Artists */}
          {contextMenu.itemType === 'artist' && (() => {
            const artist = contextMenu.item as Artist
            const fav = isFavorited(artist.artistId, 'artist')
            return (
              <>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    onNavigate('artist', artist.artistId)
                    setContextMenu(null)
                  }}
                >
                  <User className="size-3.5 text-primary" />
                  Go to Artist Page
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent text-left transition-colors text-xs font-medium"
                  onClick={() => {
                    toggleFavorite(artist.artistId, 'artist', artist)
                    setContextMenu(null)
                  }}
                >
                  {fav ? <Check className="size-3.5 text-primary" /> : <Plus className="size-3.5 text-primary" />}
                  {fav ? 'In Sidebar' : 'Add to Sidebar'}
                </button>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
