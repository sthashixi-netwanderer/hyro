import { useLikedSongs } from '../../context/LikedSongsContext'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { getTrackThumbnailUrl } from '../../../../shared/utils'
import type { Track } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { Music, Play, Pause, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LikedSongs() {
  const { tracks, loading, removeTrack } = useLikedSongs()
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer()
  const { navigateTo } = useNavigation()

  function handlePlayAll() {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks)
    }
  }

  function handlePlayTrack(track: Track) {
    const isCurrentTrack = currentTrack?.videoId === track.videoId
    if (isCurrentTrack) {
      togglePlay()
    } else {
      playTrack(track, tracks)
    }
  }

  function handleRemoveTrack(videoId: string, e: React.MouseEvent) {
    e.stopPropagation()
    removeTrack(videoId)
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function getTotalDuration(): string {
    const total = tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
    const hours = Math.floor(total / 3600)
    const mins = Math.floor((total % 3600) / 60)
    if (hours > 0) return `${hours} hr ${mins} min`
    return `${mins} min`
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
          <h1 className="text-2xl font-bold">Liked Songs</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
          <h1 className="text-2xl font-bold">Liked Songs</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Plus className="size-12 mb-4" />
            <p className="text-lg">No liked songs yet</p>
            <p className="text-sm">Tap the + button on tracks, albums, or playlists to add them here</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Liked Songs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tracks.length} song{tracks.length !== 1 ? 's' : ''} &middot; {getTotalDuration()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handlePlayAll}
            >
              <Play className="size-4 fill-current" />
              Play All
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Track List */}
      <div className="flex-1 overflow-y-auto">
        {/* Column Headers */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/10 px-8 py-2 flex items-center gap-3 text-xs text-muted-foreground font-medium">
          <span className="w-8 text-center">#</span>
          <span className="flex-1">Title</span>
          <span className="w-20 text-right">Duration</span>
          <span className="w-8" />
        </div>

        <div className="px-8 py-1">
          {tracks.map((track, index) => {
            const isCurrentTrack = currentTrack?.videoId === track.videoId
            const isTrackPlaying = isCurrentTrack && isPlaying
            return (
              <div
                key={`${track.videoId}-${index}`}
                className={cn(
                  'flex items-center gap-3 px-2 py-2 rounded-md transition-colors group cursor-pointer',
                  isCurrentTrack ? 'bg-accent/50' : 'hover:bg-accent'
                )}
                onClick={() => handlePlayTrack(track)}
              >
                <div className="w-8 text-center">
                  {isTrackPlaying ? (
                    <Music className="size-4 text-primary mx-auto animate-pulse" />
                  ) : isCurrentTrack ? (
                    <Music className="size-4 text-primary mx-auto" />
                  ) : (
                    <span className="text-sm text-muted-foreground group-hover:hidden">
                      {index + 1}
                    </span>
                  )}
                  {!isTrackPlaying && !isCurrentTrack && (
                    <Play className="size-4 text-foreground mx-auto hidden group-hover:block fill-current" />
                  )}
                </div>
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
                  <p
                    className="text-xs text-muted-foreground truncate cursor-pointer hover:underline"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      if (track.artist?.artistId) navigateTo('artist', track.artist.artistId)
                    }}
                  >
                    {track.artist?.name}
                    {track.album && <span> &middot; {track.album.name}</span>}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-20 text-right">
                  {formatDuration(track.duration)}
                </span>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                  onClick={(e) => handleRemoveTrack(track.videoId, e)}
                  title="Remove from liked songs"
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
