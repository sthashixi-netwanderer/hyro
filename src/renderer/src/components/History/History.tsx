import { useState } from 'react'
import { useHistory, type HistoryEntry } from '../../context/HistoryContext'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { getTrackThumbnailUrl } from '../../../../shared/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Music, Trash2, Trash, Clock, Search, X, ListPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function History() {
  const { history, loading, removeTracks, clearAll } = useHistory()
  const { playTrack, currentTrack, isPlaying, addToQueue } = usePlayer()
  const { navigateTo } = useNavigation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredHistory = history.filter(entry => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    return (
      entry.name.toLowerCase().includes(query) ||
      entry.artist?.name.toLowerCase().includes(query) ||
      (entry.album?.name && entry.album.name.toLowerCase().includes(query))
    )
  })

  function toggleSearch() {
    if (showSearch) {
      setSearchQuery('')
    }
    setShowSearch(!showSearch)
  }

  function toggleSelect(videoId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) {
        next.delete(videoId)
      } else {
        next.add(videoId)
      }
      return next
    })
  }

  function selectAll() {
    const currentList = showSearch ? filteredHistory : history
    if (selected.size === currentList.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(currentList.map(e => e.videoId)))
    }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return
    await removeTracks(Array.from(selected))
    setSelected(new Set())
    setSelectMode(false)
  }

  async function handleClearAll() {
    await clearAll()
    setSelected(new Set())
    setSelectMode(false)
  }

  function handlePlay(entry: HistoryEntry) {
    // Build a Track-compatible object from the history entry
    const track = {
      videoId: entry.videoId,
      name: entry.name,
      artist: entry.artist,
      album: entry.album,
      duration: entry.duration,
      thumbnails: entry.thumbnails,
      type: entry.type,
      filePath: entry.filePath,
      thumbnailPath: entry.thumbnailPath
    }
    // Play from the filtered list as queue when search is active
    const currentQueueList = showSearch ? filteredHistory : history
    const queue = currentQueueList.map(e => ({
      videoId: e.videoId,
      name: e.name,
      artist: e.artist,
      album: e.album,
      duration: e.duration,
      thumbnails: e.thumbnails,
      type: e.type,
      filePath: e.filePath,
      thumbnailPath: e.thumbnailPath
    }))
    playTrack(track, queue)
  }

  function formatDate(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">History</h1>
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">History</h1>
        <div className="flex gap-2">
          {history.length > 0 && (
            <>
              {selectMode ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelected(new Set()) }}>
                    Cancel
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    {selected.size === (showSearch ? filteredHistory.length : history.length) ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selected.size > 0 && (
                    <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                      <Trash2 className="size-4" />
                      Delete ({selected.size})
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button 
                    variant={showSearch ? "secondary" : "ghost"} 
                    size="sm" 
                    onClick={toggleSearch}
                    className={cn(showSearch && "bg-accent text-white")}
                  >
                    <Search className="size-4" />
                    Search
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                    <Trash className="size-4" />
                    Select
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleClearAll}>
                    <Trash2 className="size-4" />
                    Clear All
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Search Input Bar (Shown when search is active) */}
      {showSearch && history.length > 0 && (
        <div className="relative mb-6 animate-in fade-in slide-in-from-top-1 duration-200">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search in history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 bg-accent/40 border-none text-sm w-full max-w-md focus-visible:ring-1 focus-visible:ring-primary"
            autoFocus
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground hover:text-white rounded-full"
              onClick={() => setSearchQuery('')}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Clock className="size-12 mb-4" />
          <p className="text-lg">No play history yet</p>
          <p className="text-sm">Tracks you play will appear here</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in duration-200">
          <Search className="size-12 mb-4 text-muted-foreground/50" />
          <p className="text-lg font-semibold text-white/90">No results found</p>
          <p className="text-sm">No matches in your history for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {filteredHistory.map((entry) => {
            const isCurrentTrack = currentTrack?.videoId === entry.videoId
            const isSelected = selected.has(entry.videoId)
            return (
              <div
                key={`${entry.videoId}-${entry.playedAt}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md transition-colors group',
                  isCurrentTrack ? 'bg-accent/50' : 'hover:bg-accent',
                  selectMode && isSelected && 'bg-accent/30'
                )}
              >
                {selectMode && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(entry.videoId)}
                    className="shrink-0"
                  />
                )}
                <div
                  className="w-10 h-10 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center cursor-pointer"
                  onClick={() => handlePlay(entry)}
                >
                  {getTrackThumbnailUrl(entry) ? (
                    <img src={getTrackThumbnailUrl(entry)} alt={entry.name} className="w-full h-full object-cover" />
                  ) : (
                    <Music className="size-3 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePlay(entry)}>
                  <p className={cn('text-sm font-medium truncate', isCurrentTrack && 'text-primary')}>
                    {entry.name}
                  </p>
                  <p
                    className={cn(
                      'text-xs text-muted-foreground truncate',
                      entry.artist?.artistId && 'hover:underline cursor-pointer'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (entry.artist?.artistId) navigateTo('artist', entry.artist.artistId)
                    }}
                  >
                    {entry.artist?.name}
                    {entry.album && <span> {'\u00B7'} {entry.album.name}</span>}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {formatDate(entry.playedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    addToQueue(entry)
                  }}
                  title="Add to Queue"
                >
                  <ListPlus className="size-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                  {formatDuration(entry.duration)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
