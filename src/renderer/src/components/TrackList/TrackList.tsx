import type { Track } from '../../../../shared/types'
import { getTrackThumbnailUrl } from '../../../../shared/utils'
import { usePlayer } from '../../context/PlayerContext'
import { useDownload } from '../../context/DownloadContext'
import { useNavigation } from '../../context/NavigationContext'
import { Button } from '@/components/ui/button'
import FavoriteButton from '@/components/ui/FavoriteButton'
import { Music, Download, Check, ListPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrackListProps {
  tracks: Track[]
  showIndex?: boolean
  showDownload?: boolean
  onPlay?: (track: Track) => void
}

export default function TrackList({ tracks, showIndex = true, showDownload = true, onPlay }: TrackListProps) {
  const { playTrack, currentTrack, isPlaying, addToQueue } = usePlayer()
  const { downloadTrack, isDownloading, getProgress, isDownloaded } = useDownload()
  const { navigateTo } = useNavigation()

  function handlePlay(track: Track) {
    if (onPlay) {
      onPlay(track)
    } else {
      playTrack(track, tracks)
    }
  }

  function handleDownload(e: React.MouseEvent, track: Track) {
    e.stopPropagation()
    downloadTrack(track)
  }

  function handleAddToQueue(e: React.MouseEvent, track: Track) {
    e.stopPropagation()
    addToQueue(track)
  }

  function formatDuration(seconds: number): string {
    const num = Number(seconds)
    if (!num || isNaN(num)) return ''
    const mins = Math.floor(num / 60)
    const secs = Math.floor(num % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-0.5">
      {tracks.map((track, index) => {
        const isCurrentTrack = currentTrack?.videoId === track.videoId
        const downloading = isDownloading(track.videoId)
        const progress = getProgress(track.videoId)
        const downloaded = isDownloaded(track.videoId)
        const isDone = downloaded || progress?.status === 'done'
        return (
          <div
            key={`${track.videoId}-${index}`}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors group',
              isCurrentTrack ? 'bg-accent/50' : 'hover:bg-accent'
            )}
            onClick={() => handlePlay(track)}
          >
            <div className="w-8 text-center shrink-0">
              {isCurrentTrack && isPlaying ? (
                <span className="playing-indicator text-primary text-sm">&#9835;</span>
              ) : showIndex ? (
                <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              ) : null}
            </div>
            <div className="w-10 h-10 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
              {getTrackThumbnailUrl(track) ? (
                <img src={getTrackThumbnailUrl(track)} alt={track.name} className="w-full h-full object-cover" />
              ) : (
                <Music className="size-3 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium truncate', isCurrentTrack && 'text-primary')}>
                {track.name}
              </p>
              <span className="text-xs text-muted-foreground truncate block">
                {track.artists && track.artists.length > 0 ? (
                  track.artists.map((art, artIdx) => (
                    <span key={art.artistId || art.name}>
                      {artIdx > 0 && <span className="cursor-default select-none">, </span>}
                      <span
                        className={cn(
                          art.artistId && 'hover:underline cursor-pointer hover:text-foreground transition-colors'
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (art.artistId) navigateTo('artist', art.artistId)
                        }}
                      >
                        {art.name}
                      </span>
                    </span>
                  ))
                ) : (
                  <span
                    className={cn(
                      track.artist?.artistId && 'hover:underline cursor-pointer hover:text-foreground transition-colors'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (track.artist?.artistId) navigateTo('artist', track.artist.artistId)
                    }}
                  >
                    {track.artist?.name || 'Unknown Artist'}
                  </span>
                )}
              </span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {track.duration ? formatDuration(track.duration) : ''}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => handleAddToQueue(e, track)}
              title="Add to Queue"
            >
              <ListPlus className="size-3.5" />
            </Button>
            <FavoriteButton
              id={track.videoId}
              type="track"
              data={track}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            />
            {showDownload && (
              downloading ? (
                <div className="shrink-0 relative" title={`Downloading ${Math.round(progress?.progress || 0)}%`}>
                  <svg className="size-7 -rotate-90" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                    <circle
                      cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className="text-primary transition-all duration-300"
                      strokeDasharray={`${2 * Math.PI * 14}`}
                      strokeDashoffset={`${2 * Math.PI * 14 * (1 - (progress?.progress || 0) / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-primary">
                    {Math.round(progress?.progress || 0)}
                  </span>
                </div>
              ) : isDone ? (
                <div className="shrink-0 size-7 flex items-center justify-center rounded-full bg-primary/15 text-primary" title="Downloaded">
                  <Check className="size-3.5" />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => handleDownload(e, track)}
                  title="Download"
                >
                  <Download className="size-3" />
                </Button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
