import { Minus, Square, X } from 'lucide-react'
import { usePlayer } from '../../context/PlayerContext'
import { useDownload } from '../../context/DownloadContext'
import { cn } from '@/lib/utils'
import logo from '../../assets/logo.png'

export default function TitleBar() {
  const { currentTrack, isPlaying } = usePlayer()
  const { downloads, isPopupExpanded, setIsPopupExpanded } = useDownload()

  const activeDownloads = downloads.filter(d => d.status === 'downloading')
  const activeCount = activeDownloads.length
  const overallProgress = activeCount > 0
    ? Math.round(activeDownloads.reduce((sum, item) => sum + item.progress, 0) / activeCount)
    : 0

  const handleMinimize = () => {
    window.api.minimizeWindow()
  }

  const handleMaximize = () => {
    window.api.maximizeWindow()
  }

  const handleClose = () => {
    window.api.closeWindow()
  }

  return (
    <div
      className="h-8 bg-[#0a0a0a] border-b border-border/20 flex items-center justify-between px-4 select-none shrink-0 z-50"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side: App Logo & Name */}
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <img
          src={logo}
          alt="Hyro Logo"
          className={`size-4 object-contain ${isPlaying ? 'animate-spin' : ''}`}
          style={{ animationDuration: '6s' }}
        />
        <span>Hyro Music</span>
      </div>

      {/* Center: Current Track info (subtle premium touch) */}
      <div className="hidden sm:block text-[11px] text-muted-foreground/60 font-medium max-w-[40%] truncate">
        {currentTrack ? `${currentTrack.name} - ${currentTrack.artist?.name || 'Unknown'}` : ''}
      </div>

      {/* Right side: Control buttons & download progress */}
      <div
        className="flex items-center h-full gap-2 -mr-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {activeCount > 0 && (
          <button
            onClick={() => setIsPopupExpanded(!isPopupExpanded)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-full border cursor-pointer text-xs font-semibold transition-all select-none',
              isPopupExpanded
                ? 'bg-primary/25 border-primary/50 text-primary shadow-sm'
                : 'bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary'
            )}
            title={`Downloading ${activeCount} item${activeCount > 1 ? 's' : ''} (${overallProgress}%) - Click to toggle download details`}
          >
            <div className="relative size-5 shrink-0">
              <svg className="size-5 -rotate-90" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/10" />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-primary transition-all duration-300"
                  strokeDasharray={`${2 * Math.PI * 8}`}
                  strokeDashoffset={`${2 * Math.PI * 8 * (1 - overallProgress / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-primary font-mono leading-none">
                {overallProgress}
              </span>
            </div>
            <span className="text-[10px] hidden md:inline">Down</span>
          </button>
        )}

        <div className="flex items-center h-full">
          <button
            onClick={handleMinimize}
            className="h-full px-4 hover:bg-white/5 text-muted-foreground hover:text-white flex items-center justify-center transition-colors"
            title="Minimize"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="h-full px-4 hover:bg-white/5 text-muted-foreground hover:text-white flex items-center justify-center transition-colors"
            title="Maximize"
          >
            <Square className="size-3" />
          </button>
          <button
            onClick={handleClose}
            className="h-full px-4 hover:bg-red-500 text-muted-foreground hover:text-white flex items-center justify-center transition-colors"
            title="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
