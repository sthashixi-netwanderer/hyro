import { useLikedSongs } from '../../context/LikedSongsContext'
import type { Album } from '../../../../shared/types'
import { Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AlbumFavoriteButtonProps {
  album: Album
  className?: string
  size?: 'sm' | 'md'
}

export default function AlbumFavoriteButton({ album, className, size = 'sm' }: AlbumFavoriteButtonProps) {
  const { addTracks, tracks: likedSongs } = useLikedSongs()
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  // Check if any tracks from this album are already liked
  const albumTracks = album.songs || []
  const likedCount = albumTracks.filter(t => likedSongs.some(ls => ls.videoId === t.videoId)).length
  const allLiked = albumTracks.length > 0 && likedCount === albumTracks.length
  const someLiked = likedCount > 0 && !allLiked

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (allLiked) return // Already all added
    if (albumTracks.length === 0) return
    await addTracks(albumTracks)
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
      title={allLiked ? 'Album already in liked songs' : someLiked ? `Add remaining ${albumTracks.length - likedCount} tracks` : 'Save album to liked songs'}
    >
      {allLiked ? <Check className={iconSize} /> : <Plus className={iconSize} />}
    </button>
  )
}
