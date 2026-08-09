import { useState, useEffect } from 'react'
import { usePlaylists } from '../../context/PlaylistsContext'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { getTrackThumbnailUrl } from '../../../../shared/utils'
import type { UserPlaylist, Track } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { Music, Play, Pause, ArrowLeft, MoreHorizontal, Trash2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlaylistDialog from '../ui/PlaylistDialog'

interface UserPlaylistDetailProps {
  playlistId: string
  onBack: () => void
}

export default function UserPlaylistDetail({ playlistId, onBack }: UserPlaylistDetailProps) {
  const { playlists, removeTrackFromPlaylist, deletePlaylist } = usePlaylists()
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer()
  const { navigateTo } = useNavigation()
  const [playlist, setPlaylist] = useState<UserPlaylist | null>(null)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; videoId: string } | null>(null)

  useEffect(() => {
    const found = playlists.find(p => p.id === playlistId)
    setPlaylist(found || null)
  }, [playlists, playlistId])

  function handlePlayAll() {
    if (playlist && playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], playlist.tracks)
    }
  }

  function handlePlayTrack(track: Track) {
    if (!playlist) return
    const isCurrentTrack = currentTrack?.videoId === track.videoId
    if (isCurrentTrack) {
      togglePlay()
    } else {
      playTrack(track, playlist.tracks)
    }
  }

  function handleRemoveTrack(videoId: string) {
    removeTrackFromPlaylist(playlistId, videoId)
    setContextMenu(null)
  }

  function handleDeletePlaylist() {
    deletePlaylist(playlistId)
    onBack()
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function getTotalDuration(): string {
    if (!playlist) return ''
    const total = playlist.tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
    const hours = Math.floor(total / 3600)
    const mins = Math.floor((total % 3600) / 60)
    if (hours > 0) return `${hours} hr ${mins} min`
    return `${mins} min`
  }

  if (!playlist) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Playlist not found
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
        <div className="flex items-start gap-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="mt-1 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
            {playlist.thumbnailUrl ? (
              <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
            ) : (
              <Music className="size-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Playlist</p>
            <h1 className="text-2xl font-bold truncate mt-1">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-sm text-muted-foreground mt-1 truncate">{playlist.description}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {playlist.tracks.length} song{playlist.tracks.length !== 1 ? 's' : ''}
              {playlist.tracks.length > 0 && <span> &middot; {getTotalDuration()}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRenameDialog(true)}
              title="Rename playlist"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeletePlaylist}
              className="text-destructive hover:text-destructive"
              title="Delete playlist"
            >
              <Trash2 className="size-4" />
            </Button>
            {playlist.tracks.length > 0 && (
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handlePlayAll}
              >
                <Play className="size-4 fill-current" />
                Play All
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Track List */}
      <div className="flex-1 overflow-y-auto">
        {playlist.tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Music className="size-12 mb-4" />
            <p className="text-lg">This playlist is empty</p>
            <p className="text-sm">Find songs and add them to this playlist</p>
          </div>
        ) : (
          <>
            {/* Column Headers */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/10 px-8 py-2 flex items-center gap-3 text-xs text-muted-foreground font-medium">
              <span className="w-8 text-center">#</span>
              <span className="flex-1">Title</span>
              <span className="w-20 text-right">Duration</span>
              <span className="w-8" />
            </div>

            <div className="px-8 py-1">
              {playlist.tracks.map((track, index) => {
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
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveTrack(track.videoId)
                      }}
                      title="Remove from playlist"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <PlaylistDialog
        open={showRenameDialog}
        onOpenChange={setShowRenameDialog}
        mode="rename"
        playlistId={playlist.id}
        initialName={playlist.name}
      />
    </div>
  )
}
