import { useState } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { bestThumbnailUrl } from '../../../../shared/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Music, Trash2, ChevronUp, ChevronDown, X, GripVertical, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Queue() {
  const {
    queue,
    queueIndex,
    currentTrack,
    playTrack,
    clearQueue,
    removeFromQueue,
    rearrangeQueue
  } = usePlayer()
  const { navigateTo } = useNavigation()
  const [searchQuery, setSearchQuery] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function formatDuration(seconds: number): string {
    const num = Number(seconds)
    if (!num || isNaN(num)) return ''
    const mins = Math.floor(num / 60)
    const secs = Math.floor(num % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const query = searchQuery.toLowerCase().trim()

  const isCurrentTrackMatching = !query || (currentTrack && (
    currentTrack.name.toLowerCase().includes(query) ||
    (currentTrack.artist?.name && currentTrack.artist.name.toLowerCase().includes(query)) ||
    (currentTrack.album?.name && currentTrack.album.name.toLowerCase().includes(query))
  ))

  const upcomingTracksWithIndex = queue
    .map((track, idx) => ({ track, actualIndex: idx, displayIndex: idx - queueIndex }))
    .filter((item) => item.actualIndex > queueIndex)

  const filteredUpcoming = upcomingTracksWithIndex.filter(({ track }) => {
    if (!query) return true
    return (
      track.name.toLowerCase().includes(query) ||
      (track.artist?.name && track.artist.name.toLowerCase().includes(query)) ||
      (track.album?.name && track.album.name.toLowerCase().includes(query))
    )
  })

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Queue</h2>
          {queue.length > 0 && (
            <span className="text-xs text-muted-foreground bg-accent/60 border border-border/40 px-2.5 py-1 rounded-full font-medium">
              {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
            </span>
          )}
        </div>
        {queue.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search queue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 bg-accent/40 border-border/60 text-sm focus-visible:ring-1"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full"
                  title="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button variant="destructive" size="sm" onClick={clearQueue} className="h-9">
              <Trash2 className="size-4" />
              Clear Queue
            </Button>
          </div>
        )}
      </div>

      {currentTrack && isCurrentTrackMatching && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Now Playing</h3>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 border border-primary/20">
            <div className="w-12 h-12 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
              {bestThumbnailUrl(currentTrack.thumbnails) ? (
                <img src={bestThumbnailUrl(currentTrack.thumbnails)} alt={currentTrack.name} className="w-full h-full object-cover" />
              ) : (
                <Music className="size-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary truncate">{currentTrack.name}</p>
              <p
                className={cn(
                  'text-xs text-muted-foreground truncate',
                  currentTrack.artist?.artistId && 'hover:underline cursor-pointer'
                )}
                onClick={() => {
                  if (currentTrack.artist?.artistId) navigateTo('artist', currentTrack.artist.artistId)
                }}
              >
                {currentTrack.artist?.name}
              </p>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {currentTrack.duration ? formatDuration(currentTrack.duration) : ''}
            </span>
          </div>
        </div>
      )}

      {filteredUpcoming.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>Up Next</span>
            <span className="text-xs text-muted-foreground/70 font-normal">
              ({filteredUpcoming.length}{searchQuery ? ` of ${upcomingTracksWithIndex.length}` : ''})
            </span>
          </h3>
          <div className="space-y-1">
            {filteredUpcoming.map(({ track, actualIndex, displayIndex }) => (
              <div
                key={`${track.videoId}-${actualIndex}`}
                draggable
                onDragStart={(e) => {
                  setDraggedIndex(actualIndex)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', actualIndex.toString())
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverIndex !== actualIndex) {
                    setDragOverIndex(actualIndex)
                  }
                }}
                onDragLeave={() => {
                  if (dragOverIndex === actualIndex) {
                    setDragOverIndex(null)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const fromIdx = draggedIndex !== null ? draggedIndex : parseInt(e.dataTransfer.getData('text/plain'), 10)
                  if (!isNaN(fromIdx) && fromIdx !== actualIndex) {
                    rearrangeQueue(fromIdx, actualIndex)
                  }
                  setDraggedIndex(null)
                  setDragOverIndex(null)
                }}
                onDragEnd={() => {
                  setDraggedIndex(null)
                  setDragOverIndex(null)
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors group cursor-pointer border',
                  draggedIndex === actualIndex && 'opacity-40 border-dashed border-primary/60 bg-muted/40',
                  dragOverIndex === actualIndex && draggedIndex !== actualIndex && 'border-primary bg-primary/10 shadow-sm',
                  draggedIndex !== actualIndex && dragOverIndex !== actualIndex && 'border-transparent'
                )}
                onClick={() => playTrack(track, queue)}
              >
                <div
                  className="p-1 text-muted-foreground/60 group-hover:text-muted-foreground hover:text-white cursor-grab active:cursor-grabbing shrink-0"
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="size-4" />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-6 text-center shrink-0">
                  {displayIndex}
                </span>
                <div className="w-10 h-10 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                  {bestThumbnailUrl(track.thumbnails) ? (
                    <img src={bestThumbnailUrl(track.thumbnails)} alt={track.name} className="w-full h-full object-cover" />
                  ) : (
                    <Music className="size-3 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.name}</p>
                  <p
                    className={cn(
                      'text-xs text-muted-foreground truncate',
                      track.artist?.artistId && 'hover:underline cursor-pointer'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (track.artist?.artistId) navigateTo('artist', track.artist.artistId)
                    }}
                  >
                    {track.artist?.name}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 group-hover:hidden">
                  {track.duration ? formatDuration(track.duration) : ''}
                </span>
                <div className="hidden group-hover:flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={actualIndex === queueIndex + 1}
                    onClick={() => rearrangeQueue(actualIndex, actualIndex - 1)}
                    className="p-1 text-muted-foreground hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Move Up"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={actualIndex === queue.length - 1}
                    onClick={() => rearrangeQueue(actualIndex, actualIndex + 1)}
                    className="p-1 text-muted-foreground hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Move Down"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(actualIndex)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors ml-1"
                    title="Remove from Queue"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {searchQuery && !isCurrentTrackMatching && filteredUpcoming.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Search className="size-10 mb-3 opacity-60" />
          <p className="text-base font-medium mb-1">No matching tracks found</p>
          <p className="text-xs text-muted-foreground/70 mb-4">No results for &quot;{searchQuery}&quot; in current queue</p>
          <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
            Clear Filter
          </Button>
        </div>
      )}

      {queue.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Music className="size-12 mb-4" />
          <p className="text-base font-medium mb-1">Your queue is empty</p>
          <p className="text-sm">Play some music to fill your queue</p>
        </div>
      )}
    </div>
  )
}
