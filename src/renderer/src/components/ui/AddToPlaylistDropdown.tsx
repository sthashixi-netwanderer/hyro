import { useState } from 'react'
import { useLikedSongs } from '../../context/LikedSongsContext'
import { usePlaylists } from '../../context/PlaylistsContext'
import type { Track } from '../../../../shared/types'
import { Plus, Check, ListMusic, Music, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import PlaylistDialog from './PlaylistDialog'

interface AddToPlaylistDropdownProps {
  id?: string
  track: Track
  className?: string
  size?: 'sm' | 'md'
}

export default function AddToPlaylistDropdown({ id, track, className, size = 'sm' }: AddToPlaylistDropdownProps) {
  const { isLiked, toggleLike } = useLikedSongs()
  const { playlists, addTrackToPlaylist, createPlaylist } = usePlaylists()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const liked = isLiked(track.videoId)
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  async function handleAddToLikedSongs() {
    await toggleLike(track)
  }

  async function handleAddToPlaylist(playlistId: string) {
    await addTrackToPlaylist(playlistId, track)
  }

  async function handleCreateAndAdd(name: string) {
    const playlist = await createPlaylist(name)
    if (playlist) {
      await addTrackToPlaylist(playlist.id, track)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'transition-colors p-1 rounded-full',
              liked ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground',
              !liked && 'hover:bg-primary/10 hover:text-primary',
              liked && 'bg-primary/20 text-primary',
              className
            )}
            onClick={(e) => e.stopPropagation()}
            title="Add to playlist"
          >
            {liked ? <Check className={iconSize} /> : <Plus className={iconSize} />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={4}
          className="w-56 max-h-80 overflow-y-auto"
        >
          {/* Liked Songs */}
          <DropdownMenuItem onClick={handleAddToLikedSongs}>
            <div className={cn(
              'size-6 rounded flex items-center justify-center shrink-0',
              liked ? 'bg-primary/20' : 'bg-muted'
            )}>
              <Music className={cn('size-3', liked ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <span className="flex-1">Liked Songs</span>
            {liked && <Check className="size-4 text-primary shrink-0" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* User Playlists */}
          {playlists.map((playlist) => {
            const inPlaylist = playlist.tracks.some(t => t.videoId === track.videoId)
            return (
              <DropdownMenuItem
                key={playlist.id}
                onClick={() => handleAddToPlaylist(playlist.id)}
              >
                <div className="size-6 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                  {playlist.thumbnailUrl ? (
                    <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
                  ) : (
                    <ListMusic className="size-3 text-muted-foreground" />
                  )}
                </div>
                <span className="flex-1 truncate">{playlist.name}</span>
                {inPlaylist && <Check className="size-4 text-primary shrink-0" />}
              </DropdownMenuItem>
            )
          })}

          {playlists.length > 0 && <DropdownMenuSeparator />}

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
        onCreate={handleCreateAndAdd}
      />
    </>
  )
}
