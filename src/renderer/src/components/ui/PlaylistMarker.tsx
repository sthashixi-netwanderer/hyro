import { useState } from 'react'
import { usePlaylists } from '../../context/PlaylistsContext'
import type { Track } from '../../../../shared/types'
import { ListMusic, Check, PlusCircle, ListMusicIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import PlaylistDialog from './PlaylistDialog'

interface PlaylistMarkerProps {
  track: Track
  className?: string
}

export default function PlaylistMarker({ track, className }: PlaylistMarkerProps) {
  const { playlists, videoIdsInPlaylists, moveTrackToPlaylist, addTrackToPlaylist, createPlaylist } = usePlaylists()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const isInPlaylist = videoIdsInPlaylists.has(track.videoId)

  if (!isInPlaylist) return null

  // Partition playlists into "current" (contains track) and "available" (does not)
  const currentPlaylists = playlists.filter(p => p.tracks.some(t => t.videoId === track.videoId))
  const availablePlaylists = playlists.filter(p => !p.tracks.some(t => t.videoId === track.videoId))

  async function handleMove(targetPlaylistId: string) {
    const fromIds = currentPlaylists.map(p => p.id)
    await moveTrackToPlaylist(track, fromIds, targetPlaylistId)
  }

  async function handleCreateAndMove(name: string) {
    const playlist = await createPlaylist(name)
    if (playlist) {
      const fromIds = currentPlaylists.map(p => p.id)
      await moveTrackToPlaylist(track, fromIds, playlist.id)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'transition-colors p-1 rounded-full text-primary/70 hover:text-primary hover:bg-primary/10',
              className
            )}
            onClick={(e) => e.stopPropagation()}
            title="In playlist"
          >
            <ListMusic className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={4}
          className="w-56 max-h-80 overflow-y-auto"
        >
          {/* Current playlists */}
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            In these playlists
          </DropdownMenuLabel>
          {currentPlaylists.map((playlist) => (
            <DropdownMenuItem key={playlist.id} className="opacity-80 cursor-default">
              <div className="size-6 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                {playlist.thumbnailUrl ? (
                  <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
                ) : (
                  <ListMusicIcon className="size-3 text-muted-foreground" />
                )}
              </div>
              <span className="flex-1 truncate">{playlist.name}</span>
              <Check className="size-4 text-primary shrink-0" />
            </DropdownMenuItem>
          ))}

          {availablePlaylists.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Move to
              </DropdownMenuLabel>
              {availablePlaylists.map((playlist) => (
                <DropdownMenuItem key={playlist.id} onClick={() => handleMove(playlist.id)}>
                  <div className="size-6 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                    {playlist.thumbnailUrl ? (
                      <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
                    ) : (
                      <ListMusicIcon className="size-3 text-muted-foreground" />
                    )}
                  </div>
                  <span className="flex-1 truncate">{playlist.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          {/* New Playlist */}
          <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
            <div className="size-6 rounded flex items-center justify-center shrink-0 bg-muted">
              <PlusCircle className="size-3 text-muted-foreground" />
            </div>
            <span className="flex-1">New Playlist</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PlaylistDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        mode="create"
        onCreate={handleCreateAndMove}
      />
    </>
  )
}
