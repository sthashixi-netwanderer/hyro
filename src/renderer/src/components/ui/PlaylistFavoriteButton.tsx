import { useLikedSongs } from '../../context/LikedSongsContext'
import type { Playlist } from '../../../../shared/types'
import { Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlaylistFavoriteButtonProps {
  playlist: Playlist
  className?: string
  size?: 'sm' | 'md'
}

export default function PlaylistFavoriteButton({ playlist, className, size = 'sm' }: PlaylistFavoriteButtonProps) {
  const { addTracks, tracks: likedSongs } = useLikedSongs()
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  const playlistTracks = playlist.videos || []
  const likedCount = playlistTracks.filter(t => likedSongs.some(ls => ls.videoId === t.videoId)).length
  const allLiked = playlistTracks.length > 0 && likedCount === playlistTracks.length
  const someLiked = likedCount > 0 && !allLiked

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (allLiked) return
    if (playlistTracks.length === 0) return
    await addTracks(playlistTracks)
  }

  return (
    <button
      className={cn(
        'transition-colors p-1 rounded-full',
        allLiked ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground',
        !allLiked && 'hover:bg-primary/10 hover:text-primary',
        allLiked && 'bg-primary/20 text-primary',
        someLiked && !allLiked && 'bg-primary/10 text-primary/70',
        className
      )}
      onClick={handleToggle}
      title={allLiked ? 'Playlist already in liked songs' : someLiked ? `Add remaining ${playlistTracks.length - likedCount} tracks` : 'Save playlist to liked songs'}
    >
      {allLiked ? <Check className={iconSize} /> : <Plus className={iconSize} />}
    </button>
  )
}
