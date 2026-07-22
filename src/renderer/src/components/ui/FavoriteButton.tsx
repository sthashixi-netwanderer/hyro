import { useFavorites } from '../../context/FavoritesContext'
import type { FavoriteItem } from '../../../../shared/types'
import { Heart, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  id: string
  type: FavoriteItem['type']
  data: any
  className?: string
  size?: 'sm' | 'md'
  variant?: 'default' | 'plus'
}

export default function FavoriteButton({ id, type, data, className, size = 'sm', variant }: FavoriteButtonProps) {
  const { isFavorited, toggleFavorite } = useFavorites()
  const favorited = isFavorited(id, type)

  const iconSize = size === 'sm' ? 'size-4' : 'size-5'
  const isArtistOrPlus = type === 'artist' || variant === 'plus'

  return (
    <button
      className={cn(
        'transition-colors p-1 rounded-full',
        favorited ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground',
        isArtistOrPlus && !favorited && 'hover:bg-primary/10 hover:text-primary',
        isArtistOrPlus && favorited && 'bg-primary/20 text-primary',
        className
      )}
      onClick={(e) => {
        e.stopPropagation()
        toggleFavorite(id, type, data)
      }}
      title={favorited ? 'Remove from sidebar/favorites' : 'Add to sidebar/favorites'}
    >
      {isArtistOrPlus ? (
        favorited ? <Check className={iconSize} /> : <Plus className={iconSize} />
      ) : (
        <Heart className={cn(iconSize, favorited && 'fill-current')} />
      )}
    </button>
  )
}
