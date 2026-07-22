import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { useDownload } from '../../context/DownloadContext'
import { useFavorites } from '../../context/FavoritesContext'
import { getTrackThumbnailUrl } from '../../../../shared/utils'
import { ASCII_LOGO } from '../../../../shared/asciiLogo'
import logo from '../../assets/logo.png'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import FavoriteButton from '@/components/ui/FavoriteButton'
import { Shuffle, SkipBack, Play, Pause, SkipForward, Square, Volume2, VolumeX, Music, Download, Check, Disc3, Mic2, Maximize2, Minimize2, Repeat, Repeat1 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SyncedLine {
  time: number
  text: string
}

interface LyricsData {
  plain: string[]
  synced: SyncedLine[]
  provider?: string
}

export default function Player() {
  const {
    currentTrack,
    isPlaying,
    isShuffled,
    repeatMode,
    volume,
    isMuted,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    prevTrack,
    stop,
    toggleShuffle,
    toggleRepeat,
    setVolume,
    toggleMute,
    seek,
    getAudioElement
  } = usePlayer()
  const { navigateTo } = useNavigation()
  const { isDownloaded, isDownloading, getProgress, downloadTrack } = useDownload()
  const { isFavorited } = useFavorites()

  // Lyrics state
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricsVisible, setLyricsVisible] = useState(false)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  const lyricsVideoIdRef = useRef<string | null>(null)
  const activeLineRef = useRef<HTMLParagraphElement>(null)

  // Full Screen player state & refs
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const fullscreenLyricsContainerRef = useRef<HTMLDivElement>(null)
  const fullscreenActiveLineRef = useRef<HTMLParagraphElement>(null)
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const downloaded = currentTrack ? isDownloaded(currentTrack.videoId) : false
  const downloading = currentTrack ? isDownloading(currentTrack.videoId) : false
  const downloadProgress = currentTrack ? getProgress(currentTrack.videoId) : undefined
  const favorited = currentTrack ? isFavorited(currentTrack.videoId, 'track') : false

  // Determine which lines to display and whether synced highlighting is available
  const hasSynced = lyricsData != null && lyricsData.synced.length > 0

  // Find the active line index from synced lyrics based on current playback time
  const activeLineIndex = useMemo(() => {
    if (!hasSynced || !lyricsData) return -1
    const synced = lyricsData.synced
    // Find the last line whose time <= currentTime
    let idx = -1
    for (let i = 0; i < synced.length; i++) {
      if (currentTime >= synced[i].time) {
        idx = i
      } else {
        break
      }
    }
    return idx
  }, [currentTime, hasSynced, lyricsData])

  // Auto-scroll to the active line when it changes
  useEffect(() => {
    const container = isFullScreen ? fullscreenLyricsContainerRef.current : lyricsContainerRef.current
    const line = isFullScreen ? fullscreenActiveLineRef.current : activeLineRef.current
    if (line && container) {
      const containerHeight = container.clientHeight
      const lineTop = line.offsetTop
      const lineHeight = line.offsetHeight
      // Center the active line in the scroll container
      const scrollTarget = lineTop - containerHeight / 2 + lineHeight / 2
      container.scrollTo({ top: scrollTarget, behavior: 'smooth' })
    }
  }, [activeLineIndex, isFullScreen])

  const fetchLyrics = useCallback(async (videoId: string, trackName: string, artistName: string, albumName: string | null, trackDuration: number | null, filePath?: string | null) => {
    if (lyricsVideoIdRef.current === videoId) return
    lyricsVideoIdRef.current = videoId
    setLyricsLoading(true)
    try {
      const data = await window.api.getLyrics(videoId, trackName, artistName, albumName, trackDuration, filePath)
      if (lyricsVideoIdRef.current === videoId) {
        setLyricsData(data)
      }
    } catch {
      if (lyricsVideoIdRef.current === videoId) {
        setLyricsData(null)
      }
    } finally {
      if (lyricsVideoIdRef.current === videoId) {
        setLyricsLoading(false)
      }
    }
  }, [])

  // Fetch lyrics when track changes and panel is open or fullscreen is active
  const shouldFetchLyrics = lyricsVisible || isFullScreen
  useEffect(() => {
    if (shouldFetchLyrics && currentTrack) {
      fetchLyrics(
        currentTrack.videoId,
        currentTrack.name,
        currentTrack.artist?.name || 'Unknown',
        currentTrack.album?.name || null,
        currentTrack.duration || null,
        currentTrack.filePath || null
      )
    } else if (!shouldFetchLyrics) {
      lyricsVideoIdRef.current = null
      setLyricsData(null)
    }
  }, [currentTrack?.videoId, shouldFetchLyrics, fetchLyrics])

  // Escape key to exit full screen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        window.api.setFullScreen(false)
      }
    }
    if (isFullScreen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullScreen])

  // Listen to OS-level fullscreen changes to keep isFullScreen state in sync
  useEffect(() => {
    const unsubscribe = window.api.onFullScreenChange((fullscreenState) => {
      setIsFullScreen(fullscreenState)
    })
    return () => unsubscribe()
  }, [])

  // Handle auto-hiding controls on inactivity in full screen
  useEffect(() => {
    if (!isFullScreen) {
      setShowControls(true)
      return
    }

    const resetTimer = () => {
      setShowControls(true)
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current)
      }
      // Only hide controls if the player is currently playing
      if (isPlaying) {
        activityTimeoutRef.current = setTimeout(() => {
          setShowControls(false)
        }, 3000)
      }
    }

    resetTimer()

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetTimer))

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current)
      }
    }
  }, [isFullScreen, isPlaying])

  function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    seek(percent * duration)
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      className="shrink-0 z-50 px-4 pb-3 pt-1"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Lyrics Panel */}
      {lyricsVisible && (
        <div className="mx-auto max-w-[1200px] mb-2">
          <div className="rounded-2xl overflow-hidden relative max-h-[360px]">
            {/* Glassmorphism background */}
            <div className="absolute inset-0 bg-white/[0.04] backdrop-blur-2xl" />
            <div className="absolute inset-0 border border-white/[0.08] rounded-2xl" />

            {/* Lyrics content */}
            <div
              ref={lyricsContainerRef}
              className="relative p-6 overflow-y-auto max-h-[360px] scroll-smooth"
            >
              {lyricsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="size-6 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : lyricsData ? (
                <div className="space-y-1 text-center py-4">
                  {hasSynced ? (
                    // Synced lyrics — highlight the active line
                    lyricsData.synced.map((line, i) => {
                      const isActive = i === activeLineIndex
                      const isPast = i < activeLineIndex
                      return (
                        <p
                          key={i}
                          ref={isActive ? activeLineRef : undefined}
                          className={cn(
                            'leading-relaxed transition-all duration-500 cursor-pointer',
                            isActive
                              ? 'text-white text-2xl font-bold tracking-tight scale-105'
                              : isPast
                                ? 'text-white/25 text-base'
                                : 'text-white/45 text-base hover:text-white/60'
                          )}
                          onClick={() => {
                            seek(line.time)
                          }}
                        >
                          {line.text || '\u00A0'}
                        </p>
                      )
                    })
                  ) : (
                    // Plain lyrics — no timestamp highlighting
                    lyricsData.plain.map((line, i) => (
                      <p
                        key={i}
                        className={cn(
                          'text-sm leading-relaxed transition-colors duration-300',
                          line.trim() ? 'text-white/70' : 'h-4'
                        )}
                      >
                        {line}
                      </p>
                    ))
                  )}
                  {lyricsData.provider && (
                    <p className="text-[10px] text-white/20 text-center mt-4 italic">
                      Lyrics provided by {lyricsData.provider}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-white/30">
                  <Mic2 className="size-8 mb-2" />
                  <p className="text-sm">No lyrics available</p>
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => setLyricsVisible(false)}
              className="absolute top-3 right-3 size-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/50 hover:text-white transition-colors text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1200px] rounded-2xl overflow-hidden relative">
        {/* Glassmorphism layers */}
        <div className="absolute inset-0 rounded-2xl bg-white/[0.06] backdrop-blur-2xl" />
        <div className="absolute inset-0 rounded-2xl border border-white/[0.08]" />
        <div className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />
        <div className="absolute -top-px left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Content */}
        <div className="relative">
          {/* Progress bar at top */}
          <div
            className="w-full h-[3px] bg-white/10 cursor-pointer group/progress relative rounded-t-2xl overflow-hidden"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-primary transition-all duration-100 relative"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 size-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-lg shadow-primary/30" />
            </div>
          </div>

          {/* Player body */}
          <div className="h-[80px] flex items-center px-6">
            {/* Left: Track Info + Actions */}
            <div className="flex items-center gap-3 w-[30%] min-w-0">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 shrink-0 flex items-center justify-center shadow-lg ring-1 ring-white/[0.08]">
                {currentTrack && getTrackThumbnailUrl(currentTrack) ? (
                  <img
                    src={getTrackThumbnailUrl(currentTrack)}
                    alt={currentTrack?.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="size-5 text-white/30" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate text-white/90">{currentTrack?.name || 'No track selected'}</p>
                <p className="text-xs text-white/40 truncate">
                  {currentTrack?.artists && currentTrack.artists.length > 0 ? (
                    currentTrack.artists.map((art, artIdx) => (
                      <span key={art.artistId || art.name}>
                        {artIdx > 0 && <span className="cursor-default select-none">, </span>}
                        <span
                          className={cn(
                            art.artistId && 'hover:underline cursor-pointer hover:text-white transition-colors'
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
                        currentTrack?.artist?.artistId && 'hover:underline cursor-pointer hover:text-white transition-colors'
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (currentTrack?.artist?.artistId) navigateTo('artist', currentTrack.artist.artistId)
                      }}
                    >
                      {currentTrack?.artist?.name || ''}
                    </span>
                  )}
                </p>
              </div>
              {/* Action buttons */}
              {currentTrack && (
                <div className="flex items-center gap-1 shrink-0">
                  {/* Download button */}
                  {downloading ? (
                    <div className="relative shrink-0" title={`Downloading ${Math.round(downloadProgress?.progress || 0)}%`}>
                      <svg className="size-7 -rotate-90" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                        <circle
                          cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5"
                          className="text-primary transition-all duration-300"
                          strokeDasharray={`${2 * Math.PI * 14}`}
                          strokeDashoffset={`${2 * Math.PI * 14 * (1 - (downloadProgress?.progress || 0) / 100)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-primary">
                        {Math.round(downloadProgress?.progress || 0)}
                      </span>
                    </div>
                  ) : downloaded ? (
                    <div className="size-8 flex items-center justify-center text-primary" title="Downloaded">
                      <Check className="size-4" />
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-white/40 hover:text-white transition-colors"
                      onClick={() => downloadTrack(currentTrack)}
                      title="Download"
                    >
                      <Download className="size-4" />
                    </Button>
                  )}

                  {/* Lyrics button */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      'transition-colors',
                      lyricsVisible ? 'text-primary hover:text-primary' : 'text-white/40 hover:text-white'
                    )}
                    onClick={() => setLyricsVisible(!lyricsVisible)}
                    title="Lyrics"
                  >
                    <Mic2 className="size-4" />
                  </Button>

                  {/* Album/Playlist navigation */}
                  {currentTrack.album && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-white/40 hover:text-white transition-colors"
                      onClick={() => navigateTo('album', currentTrack.album!.albumId)}
                      title={`Go to ${currentTrack.album.name}`}
                    >
                      <Disc3 className="size-4" />
                    </Button>
                  )}

                  {/* Favorite button */}
                  <FavoriteButton
                    id={currentTrack.videoId}
                    type="track"
                    data={currentTrack}
                    className="text-white/40 hover:text-primary"
                  />
                </div>
              )}
            </div>

            {/* Center: Controls + Progress */}
            <div className="flex flex-col items-center gap-1 w-[40%]">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'text-white/40 hover:text-white transition-colors',
                    isShuffled && 'text-primary hover:text-primary'
                  )}
                  onClick={toggleShuffle}
                  title="Shuffle"
                >
                  <Shuffle className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white/40 hover:text-white transition-colors"
                  onClick={prevTrack}
                  title="Previous"
                >
                  <SkipBack className="size-4 fill-current" />
                </Button>
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-full bg-white text-black hover:scale-105 hover:bg-white/90 transition-all shadow-lg shadow-white/10"
                  onClick={togglePlay}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="size-5 fill-current" />
                  ) : (
                    <Play className="size-5 fill-current ml-0.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white/40 hover:text-white transition-colors"
                  onClick={nextTrack}
                  title="Next"
                >
                  <SkipForward className="size-4 fill-current" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'text-white/40 hover:text-white transition-colors',
                    repeatMode !== 'off' && 'text-primary hover:text-primary'
                  )}
                  onClick={toggleRepeat}
                  title={
                    repeatMode === 'off'
                      ? 'Enable Repeat All'
                      : repeatMode === 'all'
                      ? 'Enable Repeat One'
                      : 'Disable Repeat'
                  }
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="size-4" />
                  ) : (
                    <Repeat className="size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white/40 hover:text-white transition-colors"
                  onClick={stop}
                  title="Stop"
                >
                  <Square className="size-4 fill-current" />
                </Button>
              </div>

              <div className="flex items-center gap-2 w-full max-w-[480px]">
                <span className="text-[10px] text-white/30 tabular-nums w-9 text-right">{formatTime(currentTime)}</span>
                <div className="flex-1 relative group cursor-pointer" onClick={handleProgressClick}>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                    <div
                      className="h-full bg-white/70 group-hover:bg-primary rounded-full transition-colors"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-white/30 tabular-nums w-9">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right: Volume */}
            <div className="flex items-center gap-2 w-[30%] justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white/40 hover:text-white transition-colors"
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>
              <Slider
                className="w-24"
                min={0}
                max={1}
                step={0.01}
                value={[isMuted ? 0 : volume]}
                onValueChange={([val]) => setVolume(val)}
              />
              <span className="text-[10px] text-white/50 w-8 text-right font-medium tabular-nums select-none shrink-0">
                {Math.round((isMuted ? 0 : volume) * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white/40 hover:text-white transition-colors ml-1"
                onClick={() => {
                  window.api.setFullScreen(true)
                }}
                title="Full Screen"
              >
                <Maximize2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Screen Player Overlay */}
      {isFullScreen && (
        <div className={cn("fixed inset-0 z-[100] flex flex-col bg-[#0a0a0a] text-white select-none overflow-hidden animate-in fade-in zoom-in-95 duration-300 transition-all", !showControls && "cursor-none")}>
          {/* Dynamic Blurred Backdrop */}
          {currentTrack && getTrackThumbnailUrl(currentTrack) && (
            <div 
              className="absolute inset-0 bg-cover bg-center filter blur-[120px] opacity-35 scale-125 transition-all duration-1000 pointer-events-none"
              style={{ backgroundImage: `url(${getTrackThumbnailUrl(currentTrack)})` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-[#0a0a0a] pointer-events-none" />

          {/* Bold App Name Backdrop */}
          <div className="absolute inset-0 flex items-center justify-center md:justify-end pointer-events-none select-none z-0 md:pr-[10vw]">
            <pre className="font-mono text-[2vw] leading-[1.1] text-white/[0.06] select-none pointer-events-none drop-shadow-[0_0_80px_rgba(29,185,84,0.15)] animate-pulse duration-[10s] whitespace-pre">
              {ASCII_LOGO}
            </pre>
          </div>

          {/* Top Header */}
          <div className={cn("relative z-10 flex items-center justify-between px-8 py-6 transition-all duration-500 transform", !showControls && "opacity-0 -translate-y-4 pointer-events-none")}>
            <div className="flex items-center gap-3">
              <img
                src={logo}
                alt="Hyro Logo"
                className="size-6 object-contain animate-spin"
                style={{ animationDuration: '6s' }}
              />
              <span className="text-xs font-semibold tracking-widest text-white/50 uppercase">Now Playing</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-white/5 hover:bg-white/10 hover:scale-105 text-white/70 hover:text-white transition-all size-10"
              onClick={() => window.api.setFullScreen(false)}
              title="Exit Full Screen"
            >
              <Minimize2 className="size-5" />
            </Button>
          </div>

          {/* Main Content Area */}
          <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-12 gap-12 max-w-[1200px] mx-auto w-full items-center justify-center px-8 min-h-0 py-4">
            {/* Left: Album Art + Meta info (5 cols) */}
            <div className="md:col-span-5 flex flex-col items-center md:items-start text-center md:text-left min-w-0">
              <div className="group relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] lg:w-[380px] lg:h-[380px] rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] bg-white/5 flex items-center justify-center ring-1 ring-white/10 transition-transform duration-500 hover:scale-[1.02]">
                {currentTrack && getTrackThumbnailUrl(currentTrack) ? (
                  <img
                    src={getTrackThumbnailUrl(currentTrack)}
                    alt={currentTrack.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="size-20 text-white/20" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Disc3 className="size-16 text-white/80 animate-spin" style={{ animationDuration: '10s' }} />
                </div>
              </div>
              
              <div className="mt-8 w-full flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight truncate" title={currentTrack?.name}>
                    {currentTrack?.name || 'No track selected'}
                  </h2>
                  <p className="text-base lg:text-lg text-white/50 mt-1 truncate">
                    {currentTrack?.artists && currentTrack.artists.length > 0 ? (
                      currentTrack.artists.map((art, artIdx) => (
                        <span key={art.artistId || art.name}>
                          {artIdx > 0 && <span className="cursor-default select-none">, </span>}
                          <span
                            className={cn(
                              art.artistId && 'hover:underline hover:text-white cursor-pointer transition-colors'
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (art.artistId) {
                                navigateTo('artist', art.artistId)
                                setIsFullScreen(false)
                              }
                            }}
                          >
                            {art.name}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span
                        className={cn(
                          currentTrack?.artist?.artistId && 'hover:underline hover:text-white cursor-pointer transition-colors'
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (currentTrack?.artist?.artistId) {
                            navigateTo('artist', currentTrack.artist.artistId)
                            setIsFullScreen(false)
                          }
                        }}
                      >
                        {currentTrack?.artist?.name || ''}
                      </span>
                    )}
                  </p>
                </div>
                
                {/* Quick Actions in Fullscreen */}
                {currentTrack && (
                  <div className="flex items-center gap-2 shrink-0">
                    <FavoriteButton
                      id={currentTrack.videoId}
                      type="track"
                      data={currentTrack}
                      className="text-white/40 hover:text-primary scale-110"
                    />
                    {downloading ? (
                      <div className="relative" title={`Downloading ${Math.round(downloadProgress?.progress || 0)}%`}>
                        <svg className="size-8 -rotate-90" viewBox="0 0 32 32">
                          <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
                          <circle
                            cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2"
                            className="text-primary transition-all duration-300"
                            strokeDasharray={`${2 * Math.PI * 14}`}
                            strokeDashoffset={`${2 * Math.PI * 14 * (1 - (downloadProgress?.progress || 0) / 100)}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-primary">
                          {Math.round(downloadProgress?.progress || 0)}
                        </span>
                      </div>
                    ) : downloaded ? (
                      <div title="Downloaded">
                        <Check className="size-5 text-primary" />
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white/40 hover:text-white transition-colors size-8"
                        onClick={() => downloadTrack(currentTrack)}
                        title="Download"
                      >
                        <Download className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Lyrics (7 cols) */}
            <div className="md:col-span-7 h-full flex flex-col justify-center min-h-0 w-full">
              <div
                ref={fullscreenLyricsContainerRef}
                className="w-full max-h-[350px] md:max-h-[480px] overflow-y-auto scroll-smooth pr-4 flex flex-col gap-6 relative"
                style={{
                  maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)'
                }}
              >
                {lyricsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-white/40">
                    <div className="size-8 border-2 border-white/20 border-t-primary rounded-full animate-spin mb-4" />
                    <p className="text-sm">Loading lyrics...</p>
                  </div>
                ) : lyricsData ? (
                  <div className="py-12 space-y-6">
                    {hasSynced ? (
                      lyricsData.synced.map((line, i) => {
                        const isActive = i === activeLineIndex
                        const isPast = i < activeLineIndex
                        return (
                          <p
                            key={i}
                            ref={isActive ? fullscreenActiveLineRef : undefined}
                            className={cn(
                              'leading-relaxed transition-all duration-300 cursor-pointer origin-left font-sans',
                              isActive
                                ? 'text-white text-3xl md:text-4xl font-black tracking-tight scale-105'
                                : isPast
                                  ? 'text-white/30 text-xl md:text-2xl font-bold'
                                  : 'text-white/50 text-xl md:text-2xl font-bold hover:text-white/80'
                            )}
                            onClick={() => seek(line.time)}
                          >
                            {line.text || '\u00A0'}
                          </p>
                        )
                      })
                    ) : (
                      lyricsData.plain.map((line, i) => (
                        <p
                          key={i}
                          className={cn(
                            'text-lg md:text-xl font-bold leading-relaxed transition-colors duration-300 text-white/70 text-center md:text-left',
                            line.trim() ? '' : 'h-6'
                          )}
                        >
                          {line}
                        </p>
                      ))
                    )}
                    {lyricsData.provider && (
                      <p className="text-xs text-white/20 text-center mt-8 italic">
                        Lyrics provided by {lyricsData.provider}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-white/30">
                    <Mic2 className="size-12 mb-4" />
                    <p className="text-base font-medium">Lyrics not available for this track</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Controls Area */}
          <div className={cn("relative z-10 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-10 px-8 transition-all duration-500 transform", !showControls && "opacity-0 translate-y-4 pointer-events-none")}>
            <div className="max-w-[800px] mx-auto w-full flex flex-col gap-4">
              {/* Fullscreen Progress bar */}
              <div className="flex items-center gap-4 w-full">
                <span className="text-xs text-white/40 tabular-nums w-10 text-right">{formatTime(currentTime)}</span>
                <div 
                  className="flex-1 h-1.5 bg-white/10 rounded-full cursor-pointer relative group"
                  onClick={handleProgressClick}
                >
                  <div
                    className="h-full bg-white group-hover:bg-primary rounded-full relative transition-colors"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 size-3.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
                  </div>
                </div>
                <span className="text-xs text-white/40 tabular-nums w-10">{formatTime(duration)}</span>
              </div>

              {/* Fullscreen Buttons */}
              <div className="flex items-center justify-between mt-2">
                {/* Left helper space */}
                <div className="w-[120px]" />

                {/* Main Buttons */}
                <div className="flex items-center gap-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'text-white/40 hover:text-white transition-colors size-10',
                      isShuffled && 'text-primary hover:text-primary'
                    )}
                    onClick={toggleShuffle}
                    title="Shuffle"
                  >
                    <Shuffle className="size-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/40 hover:text-white transition-colors size-10"
                    onClick={prevTrack}
                    title="Previous"
                  >
                    <SkipBack className="size-6 fill-current" />
                  </Button>
                  
                  <Button
                    size="icon"
                    className="h-14 w-14 rounded-full bg-white text-black hover:scale-105 hover:bg-white/90 transition-all shadow-xl flex items-center justify-center"
                    onClick={togglePlay}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="size-7 fill-current" />
                    ) : (
                      <Play className="size-7 fill-current ml-1" />
                    )}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/40 hover:text-white transition-colors size-10"
                    onClick={nextTrack}
                    title="Next"
                  >
                    <SkipForward className="size-6 fill-current" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'text-white/40 hover:text-white transition-colors size-10',
                      repeatMode !== 'off' && 'text-primary hover:text-primary'
                    )}
                    onClick={toggleRepeat}
                    title={
                      repeatMode === 'off'
                        ? 'Enable Repeat All'
                        : repeatMode === 'all'
                        ? 'Enable Repeat One'
                        : 'Disable Repeat'
                    }
                  >
                    {repeatMode === 'one' ? (
                      <Repeat1 className="size-5" />
                    ) : (
                      <Repeat className="size-5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/40 hover:text-white transition-colors size-10"
                    onClick={stop}
                    title="Stop"
                  >
                    <Square className="size-5 fill-current" />
                  </Button>
                </div>

                {/* Right Volume Controls */}
                <div className="flex items-center gap-3 w-[200px] justify-end">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-white/40 hover:text-white transition-colors"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                  </Button>
                  <Slider
                    className="w-24"
                    min={0}
                    max={1}
                    step={0.01}
                    value={[isMuted ? 0 : volume]}
                    onValueChange={([val]) => setVolume(val)}
                  />
                  <span className="text-xs text-white/50 w-10 text-right font-medium tabular-nums select-none shrink-0">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
