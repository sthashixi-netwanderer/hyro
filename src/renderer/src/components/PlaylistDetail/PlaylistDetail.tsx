import { useEffect, useState } from 'react'
import type { Playlist, Track } from '../../../../shared/types'
import { bestThumbnailUrl } from '../../../../shared/utils'
import TrackList from '../TrackList/TrackList'
import { usePlayer } from '../../context/PlayerContext'
import { useDownload } from '../../context/DownloadContext'
import { useNavigation } from '../../context/NavigationContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import FavoriteButton from '@/components/ui/FavoriteButton'
import { ArrowLeft, Play, Download, Check, ListMusic } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlaylistDetailProps {
  playlistId: string
  onBack: () => void
}

export default function PlaylistDetail({ playlistId, onBack }: PlaylistDetailProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { playTrack } = usePlayer()
  const { downloadPlaylist, isDownloading, getProgress, allDownloaded } = useDownload()
  const { navigateTo } = useNavigation()

  useEffect(() => {
    loadPlaylist()
  }, [playlistId])

  async function loadPlaylist() {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getPlaylist(playlistId)
      setPlaylist(data)
    } catch (err) {
      setError('Failed to load playlist.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handlePlayAll() {
    if (playlist?.videos && playlist.videos.length > 0) {
      playTrack(playlist.videos[0], playlist.videos)
    }
  }

  function handleDownloadAll() {
    if (playlist && videos.length > 0) {
      downloadPlaylist(playlist, videos)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-9 w-24 mb-6" />
        <div className="flex gap-6 items-end mb-8">
          <Skeleton className="w-[200px] h-[200px] rounded-lg shrink-0" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">{error || 'Playlist not found'}</p>
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </div>
    )
  }

  const videos = playlist.videos || []
  const playlistDownloadId = `playlist:${playlist.playlistId}`
  const playlistDownloading = isDownloading(playlistDownloadId)
  const playlistProgress = getProgress(playlistDownloadId)
  const isDone = playlistProgress?.status === 'done'
  const allTracksDownloaded = allDownloaded(videos)

  return (
    <div className="p-8">
      <Button variant="ghost" size="sm" className="mb-6" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Back
      </Button>

      <div className="flex gap-6 items-end mb-8">
        <div className="w-[200px] h-[200px] rounded-lg overflow-hidden bg-muted shrink-0 shadow-lg flex items-center justify-center">
          {bestThumbnailUrl(playlist.thumbnails) ? (
            <img src={bestThumbnailUrl(playlist.thumbnails)} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <ListMusic className="size-12 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <Badge variant="secondary" className="mb-2">Playlist</Badge>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold truncate">{playlist.name}</h1>
            <FavoriteButton
              id={playlist.playlistId}
              type="playlist"
              data={playlist}
              size="md"
              className="shrink-0"
            />
          </div>
          <p
            className={cn(
              'text-muted-foreground mb-1',
              playlist.artist?.artistId && 'hover:underline cursor-pointer'
            )}
            onDoubleClick={() => {
              if (playlist.artist?.artistId) navigateTo('artist', playlist.artist.artistId)
            }}
          >
            {playlist.artist?.name || ''}
          </p>
          <p className="text-sm text-muted-foreground">
            {videos.length > 0 && <span>{videos.length} songs</span>}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-8">
        {videos.length > 0 && (
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handlePlayAll}>
            <Play className="size-4 fill-current" />
            Play All
          </Button>
        )}
        {videos.length > 0 && !allTracksDownloaded && (
          <Button
            variant="secondary"
            className={cn(isDone && 'text-primary', playlistDownloading && 'gap-2')}
            onClick={handleDownloadAll}
            disabled={playlistDownloading}
          >
            {playlistDownloading ? (
              <>
                <div className="relative shrink-0">
                  <svg className="size-5 -rotate-90" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                    <circle
                      cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className="text-primary transition-all duration-300"
                      strokeDasharray={`${2 * Math.PI * 14}`}
                      strokeDashoffset={`${2 * Math.PI * 14 * (1 - (playlistProgress?.progress || 0) / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold tabular-nums text-primary">
                    {Math.round(playlistProgress?.progress || 0)}
                  </span>
                </div>
                Downloading
              </>
            ) : (
              <><Download className="size-4" /> Download All</>
            )}
          </Button>
        )}
        {allTracksDownloaded && (
          <Button variant="secondary" className="text-primary" disabled>
            <Check className="size-4" /> Downloaded
          </Button>
        )}
      </div>

      {videos.length > 0 ? (
        <TrackList tracks={videos} />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>No songs in this playlist.</p>
        </div>
      )}
    </div>
  )
}
