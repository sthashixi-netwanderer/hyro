import { logger } from '../../utils/logger'
import { useEffect, useState } from 'react'
import type { Album, Track } from '../../../../shared/types'
import { bestThumbnailUrl } from '../../../../shared/utils'
import TrackList from '../TrackList/TrackList'
import { usePlayer } from '../../context/PlayerContext'
import { useDownload } from '../../context/DownloadContext'
import { useNavigation } from '../../context/NavigationContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import FavoriteButton from '@/components/ui/FavoriteButton'
import CachedImage from '@/components/ui/CachedImage'
import { ArrowLeft, Play, Download, Check, Disc3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AlbumDetailProps {
  albumId: string
  onBack: () => void
}

export default function AlbumDetail({ albumId, onBack }: AlbumDetailProps) {
  const [album, setAlbum] = useState<Album | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { playTrack } = usePlayer()
  const { downloadAlbum, isDownloading, getProgress, allDownloaded } = useDownload()
  const { navigateTo } = useNavigation()

  useEffect(() => {
    loadAlbum()
  }, [albumId])

  async function loadAlbum() {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getAlbum(albumId)
      setAlbum(data)

      if (data) {
        const urls: string[] = []
        const heroUrl = bestThumbnailUrl(data.thumbnails)
        if (heroUrl) urls.push(heroUrl)
        if (data.songs) {
          for (const s of data.songs) {
            const url = bestThumbnailUrl(s.thumbnails)
            if (url) urls.push(url)
          }
        }
        if (urls.length > 0) window.api.preCacheImages(urls).catch(() => {})
      }
    } catch (err) {
      setError('Failed to load album.')
      logger.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handlePlayAll() {
    if (album?.songs && album.songs.length > 0) {
      playTrack(album.songs[0], album.songs)
    }
  }

  function handleDownloadAll() {
    if (album && songs.length > 0) {
      downloadAlbum(album, songs)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-9 w-24 mb-6" />
        <div className="flex gap-6 items-end mb-8">
          <Skeleton className="w-[200px] h-[200px] rounded-lg shrink-0" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-12" />
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

  if (error || !album) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">{error || 'Album not found'}</p>
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </div>
    )
  }

  const songs = album.songs || []
  const albumDownloadId = `album:${album.albumId}`
  const albumDownloading = isDownloading(albumDownloadId)
  const albumProgress = getProgress(albumDownloadId)
  const isDone = albumProgress?.status === 'done'
  const allTracksDownloaded = allDownloaded(songs)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-8 pt-6 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
        <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <div className="flex gap-6 items-end mb-4">
          <div className="w-[140px] h-[140px] rounded-lg overflow-hidden bg-muted shrink-0 shadow-lg flex items-center justify-center">
            <CachedImage
              src={bestThumbnailUrl(album.thumbnails)}
              alt={album.name}
              className="w-full h-full object-cover"
              fallbackIcon={<Disc3 className="size-12 text-muted-foreground" />}
            />
          </div>
          <div className="min-w-0">
            <Badge variant="secondary" className="mb-2">Album</Badge>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold truncate">{album.name}</h1>
              <FavoriteButton
                id={album.albumId}
                type="album"
                data={album}
                size="md"
                className="shrink-0"
              />
            </div>
            <p
              className={cn(
                'text-muted-foreground mb-1',
                album.artist?.artistId && 'hover:underline cursor-pointer'
              )}
              onDoubleClick={() => {
                if (album.artist?.artistId) navigateTo('artist', album.artist.artistId)
              }}
            >
              {album.artist?.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {album.year && <span>{album.year}</span>}
              {album.year && songs.length > 0 && <span> {'\u00B7'} </span>}
              {songs.length > 0 && <span>{songs.length} songs</span>}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          {songs.length > 0 && (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handlePlayAll}>
              <Play className="size-4 fill-current" />
              Play All
            </Button>
          )}
          {songs.length > 0 && !allTracksDownloaded && (
            <Button
              variant="secondary"
              className={cn(isDone && 'text-primary', albumDownloading && 'gap-2')}
              onClick={handleDownloadAll}
              disabled={albumDownloading}
            >
              {albumDownloading ? (
                <>
                  <div className="relative shrink-0">
                    <svg className="size-5 -rotate-90" viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                      <circle
                        cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className="text-primary transition-all duration-300"
                        strokeDasharray={`${2 * Math.PI * 14}`}
                        strokeDashoffset={`${2 * Math.PI * 14 * (1 - (albumProgress?.progress || 0) / 100)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold tabular-nums text-primary">
                      {Math.round(albumProgress?.progress || 0)}
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
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {songs.length > 0 ? (
          <TrackList tracks={songs} />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p>No songs in this album.</p>
          </div>
        )}
      </div>
    </div>
  )
}
