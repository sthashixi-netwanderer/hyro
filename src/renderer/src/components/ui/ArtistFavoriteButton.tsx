import { useFavorites } from '../../context/FavoritesContext'
import { Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ArtistFavoriteButtonProps {
  id: string
  artist: any
  className?: string
  size?: 'sm' | 'md'
}

export default function ArtistFavoriteButton({ id, artist, className, size = 'sm' }: ArtistFavoriteButtonProps) {
  const { isFavorited, toggleFavorite } = useFavorites()
  const liked = isFavorited(id, 'artist')
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  return (
    <button
      className={cn(
        'transition-colors p-1 rounded-full',
        liked ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground',
        !liked && 'hover:bg-primary/10 hover:text-primary',
        liked && 'bg-primary/20 text-primary',
        className
      )}
      onClick={(e) => {
        e.stopPropagation()
        toggleFavorite(id, 'artist', artist)
      }}
      title={liked ? 'Unfollow artist' : 'Follow artist'}
    >
      {liked ? <Check className={iconSize} /> : <Plus className={iconSize} />}
    </button>
  )
}
