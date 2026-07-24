import { Minus, Square, X, Sun, Moon, Monitor } from 'lucide-react'
import { usePlayer } from '../../context/PlayerContext'
import { useDownload } from '../../context/DownloadContext'
import { useTheme, type Theme } from '../../context/ThemeContext'
import { cn } from '@/lib/utils'

const THEME_CYCLE: Theme[] = ['dark', 'light', 'system']

export default function TitleBar() {
  const { currentTrack } = usePlayer()
  const { downloads, isPopupExpanded, setIsPopupExpanded } = useDownload()
  const { theme, setTheme } = useTheme()

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

  const handleCycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    setTheme(next)
  }

  const themeIcon = theme === 'light'
    ? <Sun className="size-3.5 text-amber-500" />
    : theme === 'dark'
      ? <Moon className="size-3.5 text-emerald-400" />
      : <Monitor className="size-3.5 text-blue-400" />

  const themeLabel = theme === 'system' ? 'System' : theme.charAt(0).toUpperCase() + theme.slice(1)

  return (
    <div
      className="h-8 bg-background border-b border-border/40 flex items-center justify-between px-4 select-none shrink-0 z-50 transition-colors"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side: App Logo & Name */}
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span className="font-mono text-[11px] text-primary font-black tracking-wider px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
          HYRO
        </span>
        <span className="text-foreground/80 font-medium">Music</span>
      </div>

      {/* Center: Current Track info (subtle premium touch) */}
      <div className="hidden sm:block text-[11px] text-muted-foreground font-medium max-w-[40%] truncate">
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

        <button
          onClick={handleCycleTheme}
          className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          title={`Theme: ${themeLabel} — Click to cycle`}
        >
          {themeIcon}
        </button>

        <div className="flex items-center h-full">
          <button
            onClick={handleMinimize}
            className="h-full px-3.5 hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            title="Minimize"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="h-full px-3.5 hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            title="Maximize"
          >
            <Square className="size-3" />
          </button>
          <button
            onClick={handleClose}
            className="h-full px-3.5 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground flex items-center justify-center transition-colors"
            title="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
