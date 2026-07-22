import { useFavorites } from '../../context/FavoritesContext'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { getTrackThumbnailUrl, bestThumbnailUrl } from '../../../../shared/utils'
import type { FavoriteItem, Track } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Heart, Music, Disc3, ListMusic, User, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Favorites() {
  const { favorites, loading } = useFavorites()
  const { playTrack, currentTrack, isPlaying } = usePlayer()
  const { navigateTo } = useNavigation()

  const tracks = favorites.filter(f => f.type === 'track')
  const albums = favorites.filter(f => f.type === 'album')
  const playlists = favorites.filter(f => f.type === 'playlist')
  const artists = favorites.filter(f => f.type === 'artist')

  function handlePlayTrack(entry: FavoriteItem) {
    const track = entry.data as Track
    const queue = tracks.map(f => f.data as Track)
    playTrack(track, queue)
  }

  function handlePlayAllTracks() {
    if (tracks.length > 0) {
      const allTracks = tracks.map(f => f.data as Track)
      playTrack(allTracks[0], allTracks)
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Favorites</h1>
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (favorites.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Favorites</h1>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Heart className="size-12 mb-4" />
          <p className="text-lg">No favorites yet</p>
          <p className="text-sm">Tap the heart icon on tracks, albums, or playlists to add them here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Favorites</h1>
        {tracks.length > 0 && (
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handlePlayAllTracks}>
            <Play className="size-4 fill-current" />
            Play All Songs
          </Button>
        )}
      </div>

      {/* Songs Section */}
      {tracks.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Music className="size-5 text-primary" />
            Songs
            <span className="text-sm font-normal text-muted-foreground">({tracks.length})</span>
          </h2>
          <div className="space-y-0.5">
            {tracks.map((entry) => {
              const track = entry.data as Track
              const isCurrentTrack = currentTrack?.videoId === track.videoId
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md transition-colors group cursor-pointer',
                    isCurrentTrack ? 'bg-accent/50' : 'hover:bg-accent'
                  )}
                  onClick={() => handlePlayTrack(entry)}
                >
                  <div className="w-10 h-10 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                    {getTrackThumbnailUrl(track) ? (
                      <img src={getTrackThumbnailUrl(track)} alt={track.name} className="w-full h-full object-cover" />
                    ) : (
                      <Music className="size-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium truncate', isCurrentTrack && 'text-primary')}>
                      {track.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist?.name}
                      {track.album && <span> {'\u00B7'} {track.album.name}</span>}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Albums Section */}
      {albums.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Disc3 className="size-5 text-primary" />
            Albums
            <span className="text-sm font-normal text-muted-foreground">({albums.length})</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {albums.map((entry) => {
              const album = entry.data
              return (
                <Card
                  key={entry.id}
                  className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
                  onDoubleClick={() => navigateTo('album', album.albumId)}
                >
                  <CardContent className="p-0">
                    <div className="aspect-square bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
                      {bestThumbnailUrl(album.thumbnails) ? (
                        <img src={bestThumbnailUrl(album.thumbnails)} alt={album.name} className="w-full h-full object-cover" />
                      ) : (
                        <Disc3 className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="px-3 py-3">
                      <p className="text-sm font-medium truncate">{album.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {album.artist?.name || 'Album'}
                        {album.year ? ` \u00B7 ${album.year}` : ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Playlists Section */}
      {playlists.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <ListMusic className="size-5 text-primary" />
            Playlists
            <span className="text-sm font-normal text-muted-foreground">({playlists.length})</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {playlists.map((entry) => {
              const playlist = entry.data
              return (
                <Card
                  key={entry.id}
                  className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
                  onDoubleClick={() => navigateTo('playlist', playlist.playlistId)}
                >
                  <CardContent className="p-0">
                    <div className="aspect-square bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
                      {bestThumbnailUrl(playlist.thumbnails) ? (
                        <img src={bestThumbnailUrl(playlist.thumbnails)} alt={playlist.name} className="w-full h-full object-cover" />
                      ) : (
                        <ListMusic className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="px-3 py-3">
                      <p className="text-sm font-medium truncate">{playlist.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {playlist.videoCount != null ? `${playlist.videoCount} songs` : 'Playlist'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Artists Section */}
      {artists.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <User className="size-5 text-primary" />
            Artists
            <span className="text-sm font-normal text-muted-foreground">({artists.length})</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {artists.map((entry) => {
              const artist = entry.data
              return (
                <Card
                  key={entry.id}
                  className="bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
                  onClick={() => navigateTo('artist', artist.artistId)}
                >
                  <CardContent className="p-0 flex flex-col items-center pt-6 pb-4">
                    <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-muted flex items-center justify-center mb-3">
                      {bestThumbnailUrl(artist.thumbnails) ? (
                        <img src={bestThumbnailUrl(artist.thumbnails)} alt={artist.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm font-medium truncate px-3 text-center">{artist.name}</p>
                    <p className="text-xs text-muted-foreground">Artist</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
