import { usePlaylists } from '../../context/PlaylistsContext'
import { useLikedSongs } from '../../context/LikedSongsContext'
import type { Track } from '../../../../shared/types'
import { ListMusic, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddToPlaylistMenuProps {
  track: Track
  onAdd?: () => void
}

export default function AddToPlaylistMenu({ track, onAdd }: AddToPlaylistMenuProps) {
  const { playlists, addTrackToPlaylist, createPlaylist } = usePlaylists()
  const { isLiked } = useLikedSongs()

  async function handleAddToPlaylist(playlistId: string) {
    const added = await addTrackToPlaylist(playlistId, track)
    if (added) {
      onAdd?.()
    }
  }

  async function handleCreateNew() {
    const name = `My Playlist #${playlists.length + 1}`
    const playlist = await createPlaylist(name)
    if (playlist) {
      await addTrackToPlaylist(playlist.id, track)
      onAdd?.()
    }
  }

  return (
    <div className="py-1">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
        onClick={handleCreateNew}
      >
        <Plus className="size-4" />
        New Playlist
      </button>
      <div className="my-1 h-px bg-border" />
      {playlists.map((playlist) => {
        const inPlaylist = playlist.tracks.some(t => t.videoId === track.videoId)
        return (
          <button
            key={playlist.id}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
              inPlaylist && 'text-primary'
            )}
            onClick={() => handleAddToPlaylist(playlist.id)}
          >
            <ListMusic className="size-4 shrink-0" />
            <span className="truncate flex-1">{playlist.name}</span>
            {inPlaylist && <Check className="size-4 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
