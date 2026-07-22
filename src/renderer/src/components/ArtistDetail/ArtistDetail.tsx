import { useEffect, useState } from 'react'
import type { Artist, Track, Album } from '../../../../shared/types'
import { bestThumbnailUrl } from '../../../../shared/utils'
import TrackList from '../TrackList/TrackList'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { useFavorites } from '../../context/FavoritesContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Play, Pause, Search, User, Disc3, Plus, Check, X, Music, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ArtistDetailProps {
  artistId: string
  onBack: () => void
}

export default function ArtistDetail({ artistId, onBack }: ArtistDetailProps) {
  const [artist, setArtist] = useState<Artist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'songs' | 'albums' | 'singles'>('songs')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [allAlbumTracks, setAllAlbumTracks] = useState<Track[]>([])
  const [fetchingAlbumTracks, setFetchingAlbumTracks] = useState(false)

  const { playTrack, currentTrack, isPlaying, togglePlay, addToQueue } = usePlayer()
  const { navigateTo } = useNavigation()
  const { isFavorited, toggleFavorite, updateFavorite } = useFavorites()

  // Derived state (safe when artist is null)
  const isPlayingFromArtist = artist?.songs && artist.songs.length > 0 &&
    currentTrack != null && artist.songs.some(s => s.videoId === currentTrack.videoId)

  const isFollowing = artist ? isFavorited(artist.artistId, 'artist') : false

  const songs = artist?.songs || []
  const albums = artist?.albums || []
  const singles = artist?.singles || []

  // Combine top songs and all tracks from all albums & singles into master deduplicated list
  const masterTracksMap = new Map<string, Track>()
  for (const s of songs) {
    masterTracksMap.set(s.videoId, s)
  }
  for (const s of allAlbumTracks) {
    if (!masterTracksMap.has(s.videoId)) {
      masterTracksMap.set(s.videoId, s)
    }
  }
  const allMasterTracks = Array.from(masterTracksMap.values())
  const totalTrackCount = Math.max(allMasterTracks.length, songs.length)

  // HOOK 1: Fetch artist when artistId changes
  useEffect(() => {
    loadArtist()
  }, [artistId])

  // HOOK 2: Pre-fetch tracks from all albums & singles for exhaustive search & playback
  useEffect(() => {
    if (!artist) return
    let isMounted = true

    async function fetchAllAlbumTracks() {
      const containers = [...(artist?.albums || []), ...(artist?.singles || [])]
      if (containers.length === 0) return

      setFetchingAlbumTracks(true)
      try {
        const results = await Promise.allSettled(
          containers.map((c) => window.api.getAlbum(c.albumId))
        )

        if (!isMounted) return

        const collected: Track[] = []
        const seenIds = new Set<string>()

        for (const res of results) {
          if (res.status === 'fulfilled' && res.value?.songs) {
            for (const track of res.value.songs) {
              if (track && track.videoId && !seenIds.has(track.videoId)) {
                seenIds.add(track.videoId)
                collected.push(track)
              }
            }
          }
        }

        setAllAlbumTracks(collected)
      } catch (err) {
        console.warn('[ArtistDetail] Failed to fetch all album tracks for artist search:', err)
      } finally {
        if (isMounted) setFetchingAlbumTracks(false)
      }
    }

    fetchAllAlbumTracks()

    return () => {
      isMounted = false
    }
  }, [artist])

  // HOOK 3: Keep sidebar favorite data updated in realtime with total tracks count
  useEffect(() => {
    if (artist && isFollowing && totalTrackCount > 0) {
      updateFavorite(artist.artistId, 'artist', {
        ...artist,
        totalTracks: totalTrackCount,
        songs: allMasterTracks
      })
    }
  }, [totalTrackCount, isFollowing, artist])

  async function loadArtist() {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getArtist(artistId)
      setArtist(data)
    } catch (err) {
      setError('Failed to load artist.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function playWithAllArtistTracks(initialTrack: Track, baseTracks: Track[]) {
    const allKnownTracks: Track[] = [...baseTracks]
    const seenIds = new Set(allKnownTracks.map((t) => t.videoId))

    if (artist?.songs) {
      for (const t of artist.songs) {
        if (!seenIds.has(t.videoId)) {
          seenIds.add(t.videoId)
          allKnownTracks.push(t)
        }
      }
    }

    if (allAlbumTracks.length > 0) {
      for (const t of allAlbumTracks) {
        if (!seenIds.has(t.videoId)) {
          seenIds.add(t.videoId)
          allKnownTracks.push(t)
        }
      }
    }

    playTrack(initialTrack, allKnownTracks)

    if (artist) {
      const containers = [...(artist.albums || []), ...(artist.singles || [])]
      for (const container of containers) {
        try {
          const data = await window.api.getAlbum(container.albumId)
          if (data?.songs && data.songs.length > 0) {
            for (const s of data.songs) {
              if (!seenIds.has(s.videoId)) {
                seenIds.add(s.videoId)
                addToQueue(s)
              }
            }
          }
        } catch (err) {
          console.warn(`[ArtistDetail] Failed to fetch container ${container.albumId} for exhaustive queue:`, err)
        }
      }
    }
  }

  function handlePlayAll() {
    if (!artist?.songs || artist.songs.length === 0) return

    if (isPlayingFromArtist) {
      togglePlay()
    } else {
      playWithAllArtistTracks(artist.songs[0], artist.songs)
    }
  }

  async function handlePlayAlbum(album: Album) {
    try {
      const albumData = await window.api.getAlbum(album.albumId)
      if (albumData?.songs && albumData.songs.length > 0) {
        playWithAllArtistTracks(albumData.songs[0], albumData.songs)
      }
    } catch (err) {
      console.error('Failed to load album for playback:', err)
    }
  }

  function handleToggleSearch() {
    if (showSearch) {
      setSearchQuery('')
    }
    setShowSearch(!showSearch)
  }

  // Conditional returns AFTER all hooks have been unconditionally declared
  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-9 w-24 mb-6" />
        <div className="flex gap-6 items-end mb-8">
          <Skeleton className="w-[200px] h-[200px] rounded-full shrink-0" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !artist) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">{error || 'Artist not found'}</p>
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </div>
    )
  }

  const query = searchQuery.toLowerCase().trim()

  // Filter all master tracks across all albums/singles/top songs
  const matchingSongs = allMasterTracks.filter((s) => {
    if (!query) return true
    return (
      s.name.toLowerCase().includes(query) ||
      (s.album?.name && s.album.name.toLowerCase().includes(query))
    )
  })

  // Filter albums (matching album title or any track inside the album)
  const matchingAlbums = albums.filter((a) => {
    if (!query) return true
    if (a.name.toLowerCase().includes(query)) return true
    return allAlbumTracks.some(
      (t) =>
        (t.album?.albumId === a.albumId || t.album?.name?.toLowerCase() === a.name.toLowerCase()) &&
        t.name.toLowerCase().includes(query)
    )
  })

  // Filter singles (matching single title or track inside single)
  const matchingSingles = singles.filter((a) => {
    if (!query) return true
    if (a.name.toLowerCase().includes(query)) return true
    return allAlbumTracks.some(
      (t) =>
        (t.album?.albumId === a.albumId || t.album?.name?.toLowerCase() === a.name.toLowerCase()) &&
        t.name.toLowerCase().includes(query)
    )
  })

  return (
    <div className="p-8">
      <Button variant="ghost" size="sm" className="mb-6" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Back
      </Button>

      <div className="flex gap-6 items-end mb-8">
        <div className="w-[200px] h-[200px] rounded-full overflow-hidden bg-muted shrink-0 shadow-lg flex items-center justify-center">
          {bestThumbnailUrl(artist.thumbnails) ? (
            <img src={bestThumbnailUrl(artist.thumbnails)} alt={artist.name} className="w-full h-full object-cover" />
          ) : (
            <User className="size-12 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <Badge variant="secondary" className="mb-2">Artist</Badge>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold truncate">{artist.name}</h1>
            <Button
              variant={isFollowing ? 'secondary' : 'outline'}
              size="icon"
              className={cn(
                'size-8 rounded-full border-primary/40 hover:border-primary shrink-0 transition-colors',
                isFollowing && 'bg-primary/20 text-primary border-primary'
              )}
              onClick={() =>
                toggleFavorite(artist.artistId, 'artist', {
                  ...artist,
                  totalTracks: totalTrackCount,
                  songs: allMasterTracks
                })
              }
              title={isFollowing ? 'Remove from sidebar' : 'Add to sidebar'}
            >
              {isFollowing ? <Check className="size-4 text-primary" /> : <Plus className="size-4 text-primary" />}
            </Button>
          </div>
          {artist.subscribers && (
            <p className="text-sm text-muted-foreground mb-1">{artist.subscribers}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {totalTrackCount > 0 && (
              <span>
                <strong className="font-semibold text-foreground">{totalTrackCount}</strong> {totalTrackCount === 1 ? 'track' : 'tracks'}
              </span>
            )}
            {(totalTrackCount > 0 && (albums.length > 0 || singles.length > 0)) && <span> {'\u00B7'} </span>}
            {albums.length > 0 && <span>{albums.length} albums</span>}
            {albums.length > 0 && singles.length > 0 && <span> {'\u00B7'} </span>}
            {singles.length > 0 && <span>{singles.length} singles</span>}
            {fetchingAlbumTracks && (
              <span className="ml-2 text-xs text-primary font-medium inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                indexing...
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        {songs.length > 0 && (
          <Button
            className={cn(
              'gap-2',
              isPlayingFromArtist && isPlaying
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
            onClick={handlePlayAll}
          >
            {isPlayingFromArtist && isPlaying ? (
              <>
                <Pause className="size-4 fill-current" />
                Pause
              </>
            ) : (
              <>
                <Play className="size-4 fill-current" />
                Play All
              </>
            )}
          </Button>
        )}
        <Button
          variant={isFollowing ? 'secondary' : 'outline'}
          className={cn(
            'gap-2 border-primary/40 hover:border-primary transition-all duration-200',
            isFollowing ? 'bg-primary/20 text-primary border-primary/60' : 'hover:bg-primary/10'
          )}
          onClick={() =>
            toggleFavorite(artist.artistId, 'artist', {
              ...artist,
              totalTracks: totalTrackCount,
              songs: allMasterTracks
            })
          }
        >
          {isFollowing ? (
            <>
              <Check className="size-4 text-primary" />
              In Sidebar
            </>
          ) : (
            <>
              <Plus className="size-4 text-primary" />
              Add to Sidebar
            </>
          )}
        </Button>
        <Button
          variant={showSearch ? 'default' : 'secondary'}
          className={cn('gap-2 transition-all duration-200', showSearch && 'bg-primary text-primary-foreground hover:bg-primary/90')}
          onClick={handleToggleSearch}
        >
          {showSearch ? <X className="size-4" /> : <Search className="size-4" />}
          {showSearch ? 'Close Search' : 'Search Tracks'}
        </Button>
      </div>

      {/* Full-width Search Bar for filtering Artist Page content across all albums */}
      {showSearch && (
        <div className="relative mb-6 w-full">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              autoFocus
              placeholder={`Search all ${artist.name}'s tracks, albums, and singles...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 h-11 bg-accent/40 border-primary/40 text-sm focus-visible:ring-1 focus-visible:ring-primary w-full shadow-lg rounded-xl"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full transition-colors"
                title="Clear query"
              >
                <X className="size-4" />
              </button>
            ) : fetchingAlbumTracks ? (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span className="text-[10px]">Indexing all albums...</span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Comprehensive Search Results across All Songs & All Album Tracks & Albums & Singles when searchQuery is active */}
      {query.length > 0 ? (
        <div className="space-y-8">
          {matchingSongs.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Music className="size-5 text-primary" />
                Matching Songs Across All Albums
                <span className="text-sm font-normal text-muted-foreground">({matchingSongs.length})</span>
              </h3>
              <TrackList tracks={matchingSongs} onPlay={(t) => playWithAllArtistTracks(t, matchingSongs)} />
            </section>
          )}

          {matchingAlbums.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Disc3 className="size-5 text-primary" />
                Matching Albums
                <span className="text-sm font-normal text-muted-foreground">({matchingAlbums.length})</span>
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {matchingAlbums.map((album) => (
                  <Card
                    key={album.albumId}
                    className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0 relative"
                  >
                    <CardContent className="p-0">
                      <div
                        className="aspect-square bg-muted rounded-t-xl overflow-hidden flex items-center justify-center"
                        onDoubleClick={() => navigateTo('album', album.albumId)}
                      >
                        {bestThumbnailUrl(album.thumbnails) ? (
                          <img src={bestThumbnailUrl(album.thumbnails)} alt={album.name} className="w-full h-full object-cover" />
                        ) : (
                          <Disc3 className="size-8 text-muted-foreground" />
                        )}
                      </div>
                      <button
                        className="absolute top-[calc(50%-24px)] right-3 size-10 rounded-full bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-105 shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePlayAlbum(album)
                        }}
                        title={`Play ${album.name}`}
                      >
                        <Play className="size-4 fill-current text-primary-foreground ml-0.5" />
                      </button>
                      <div className="px-3 py-3" onDoubleClick={() => navigateTo('album', album.albumId)}>
                        <p className="text-sm font-medium truncate">{album.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {album.year || 'Album'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {matchingSingles.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Disc3 className="size-5 text-primary" />
                Matching Singles
                <span className="text-sm font-normal text-muted-foreground">({matchingSingles.length})</span>
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {matchingSingles.map((album) => (
                  <Card
                    key={album.albumId}
                    className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0 relative"
                  >
                    <CardContent className="p-0">
                      <div
                        className="aspect-square bg-muted rounded-t-xl overflow-hidden flex items-center justify-center"
                        onDoubleClick={() => navigateTo('album', album.albumId)}
                      >
                        {bestThumbnailUrl(album.thumbnails) ? (
                          <img src={bestThumbnailUrl(album.thumbnails)} alt={album.name} className="w-full h-full object-cover" />
                        ) : (
                          <Disc3 className="size-8 text-muted-foreground" />
                        )}
                      </div>
                      <button
                        className="absolute top-[calc(50%-24px)] right-3 size-10 rounded-full bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-105 shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePlayAlbum(album)
                        }}
                        title={`Play ${album.name}`}
                      >
                        <Play className="size-4 fill-current text-primary-foreground ml-0.5" />
                      </button>
                      <div className="px-3 py-3" onDoubleClick={() => navigateTo('album', album.albumId)}>
                        <p className="text-sm font-medium truncate">{album.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {album.year || 'Single'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {matchingSongs.length === 0 && matchingAlbums.length === 0 && matchingSingles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              {fetchingAlbumTracks ? (
                <>
                  <Loader2 className="size-10 mb-3 animate-spin text-primary" />
                  <p className="text-base font-medium mb-1">Indexing all albums for &quot;{searchQuery}&quot;...</p>
                </>
              ) : (
                <>
                  <Search className="size-10 mb-3 opacity-40" />
                  <p className="text-base font-medium mb-1">No matching tracks or albums found</p>
                  <p className="text-sm text-muted-foreground/70">No results for &quot;{searchQuery}&quot; under {artist.name}</p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Tab Toggle */}
          <div className="flex gap-1 mb-6 bg-muted p-1 rounded-lg w-fit">
            <button
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === 'songs'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('songs')}
            >
              Top Songs
            </button>
            <button
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === 'albums'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('albums')}
            >
              Albums
            </button>
            {singles.length > 0 && (
              <button
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeTab === 'singles'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setActiveTab('singles')}
              >
                Singles
              </button>
            )}
          </div>

          {/* Content */}
          {activeTab === 'songs' && (
            <>
              {songs.length > 0 ? (
                <TrackList tracks={songs} onPlay={(t) => playWithAllArtistTracks(t, songs)} />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p>No songs available for this artist.</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'albums' && (
            <>
              {albums.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                  {albums.map((album) => (
                    <Card
                      key={album.albumId}
                      className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0 relative"
                    >
                      <CardContent className="p-0">
                        <div
                          className="aspect-square bg-muted rounded-t-xl overflow-hidden flex items-center justify-center"
                          onDoubleClick={() => navigateTo('album', album.albumId)}
                        >
                          {bestThumbnailUrl(album.thumbnails) ? (
                            <img src={bestThumbnailUrl(album.thumbnails)} alt={album.name} className="w-full h-full object-cover" />
                          ) : (
                            <Disc3 className="size-8 text-muted-foreground" />
                          )}
                        </div>
                        {/* Play button overlay */}
                        <button
                          className="absolute top-[calc(50%-24px)] right-3 size-10 rounded-full bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-105 shadow-lg"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePlayAlbum(album)
                          }}
                          title={`Play ${album.name}`}
                        >
                          <Play className="size-4 fill-current text-primary-foreground ml-0.5" />
                        </button>
                        <div className="px-3 py-3" onDoubleClick={() => navigateTo('album', album.albumId)}>
                          <p className="text-sm font-medium truncate">{album.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {album.year || 'Album'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p>No albums available for this artist.</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'singles' && (
            <>
              {singles.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                  {singles.map((album) => (
                    <Card
                      key={album.albumId}
                      className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0 relative"
                    >
                      <CardContent className="p-0">
                        <div
                          className="aspect-square bg-muted rounded-t-xl overflow-hidden flex items-center justify-center"
                          onDoubleClick={() => navigateTo('album', album.albumId)}
                        >
                          {bestThumbnailUrl(album.thumbnails) ? (
                            <img src={bestThumbnailUrl(album.thumbnails)} alt={album.name} className="w-full h-full object-cover" />
                          ) : (
                            <Disc3 className="size-8 text-muted-foreground" />
                          )}
                        </div>
                        {/* Play button overlay */}
                        <button
                          className="absolute top-[calc(50%-24px)] right-3 size-10 rounded-full bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-105 shadow-lg"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePlayAlbum(album)
                          }}
                          title={`Play ${album.name}`}
                        >
                          <Play className="size-4 fill-current text-primary-foreground ml-0.5" />
                        </button>
                        <div className="px-3 py-3" onDoubleClick={() => navigateTo('album', album.albumId)}>
                          <p className="text-sm font-medium truncate">{album.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {album.year || 'Single'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p>No singles available for this artist.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
