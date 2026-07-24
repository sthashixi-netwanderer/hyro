import { logger } from '../../utils/logger'
import { useState, useEffect } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { useDownload } from '../../context/DownloadContext'
import type { DownloadedTrack } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Play, Pause, Trash2, Music, ListPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTrackThumbnailUrl } from '../../../../shared/utils'

interface ContainerDetailProps {
  containerName: string
  onBack: () => void
}

export default function ContainerDetail({ containerName, onBack }: ContainerDetailProps) {
  const [tracks, setTracks] = useState<DownloadedTrack[]>([])
  const [loading, setLoading] = useState(true)
  const { playTrack, currentTrack, isPlaying, togglePlay, queue, addToQueue } = usePlayer()
  const { navigateTo } = useNavigation()
  const { refreshDownloaded } = useDownload()

  useEffect(() => {
    loadTracks()
  }, [containerName])

  async function loadTracks() {
    try {
      const data = await window.api.getContainerTracks(containerName)
      setTracks(data)
    } catch (err) {
      logger.error('Failed to load container tracks:', err)
    } finally {
      setLoading(false)
    }
  }

  function handlePlayTrack(track: DownloadedTrack) {
    const trackList = tracks.map(t => ({
      videoId: t.videoId,
      name: t.name,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      thumbnails: t.thumbnails,
      type: t.type,
      filePath: t.filePath,
      thumbnailPath: t.thumbnailPath
    }))
    playTrack(
      { ...track, filePath: track.filePath, thumbnailPath: track.thumbnailPath },
      trackList
    )
  }

  function handlePlayAll() {
    if (tracks.length > 0) {
      handlePlayTrack(tracks[0])
    }
  }

  async function handleDeleteTrack(track: DownloadedTrack) {
    if (!confirm(`Delete "${track.name}"?`)) return
    await window.api.deleteTrack(track.filePath)
    setTracks(prev => prev.filter(t => t.filePath !== track.filePath))
    refreshDownloaded()
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const thumbnailUrl = tracks.length > 0 ? getTrackThumbnailUrl(tracks[0]) : undefined

  if (loading) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="size-4 mr-2" /> Back
        </Button>
        <div className="animate-pulse space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-8 pt-6 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="size-4 mr-2" /> Back
        </Button>

        <div className="flex items-end gap-6 mb-4">
          <div className="w-32 h-32 rounded-lg overflow-hidden bg-muted shrink-0 shadow-lg">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={containerName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Music className="size-16" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Downloaded</p>
            <h1 className="text-2xl font-bold mt-1 truncate">{containerName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tracks.length} track{tracks.length !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2 mt-3">
              <Button onClick={handlePlayAll} className="gap-2">
                <Play className="size-4 fill-current" /> Play All
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="space-y-1">
          {tracks.map((track, index) => {
            const isCurrentTrack = currentTrack?.videoId === track.videoId && queue.some(q => q.videoId === track.videoId)
            return (
              <div
                key={track.filePath}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 rounded-md group hover:bg-accent cursor-pointer transition-colors',
                  isCurrentTrack && 'bg-accent'
                )}
                onClick={() => handlePlayTrack(track)}
              >
                <span className="text-sm text-muted-foreground w-6 text-center tabular-nums">
                  {isCurrentTrack && isPlaying ? (
                    <span className="text-primary"><Play className="size-3 inline fill-current" /></span>
                  ) : (
                    index + 1
                  )}
                </span>

                <div className="w-10 h-10 rounded overflow-hidden bg-muted shrink-0">
                  {getTrackThumbnailUrl(track) ? (
                    <img
                      src={getTrackThumbnailUrl(track)!}
                      alt={track.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Music className="size-4" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium truncate', isCurrentTrack && 'text-primary')}>{track.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{track.artist?.name}</p>
                </div>

                <div className="text-xs text-muted-foreground tabular-nums">
                  {track.duration ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60).toString().padStart(2, '0')}` : ''}
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  title="Add to queue"
                  onClick={(e) => {
                    e.stopPropagation()
                    addToQueue({
                      videoId: track.videoId,
                      name: track.name,
                      artist: track.artist,
                      album: track.album,
                      duration: track.duration,
                      thumbnails: track.thumbnails,
                      type: track.type,
                      filePath: track.filePath,
                      thumbnailPath: track.thumbnailPath
                    })
                  }}
                >
                  <ListPlus className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteTrack(track)
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
