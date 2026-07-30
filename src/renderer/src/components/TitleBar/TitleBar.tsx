import { useState, useEffect } from 'react'
import { Minus, Square, X, Sun, Moon, Monitor, ArrowDownToLine, ExternalLink, Loader2 } from 'lucide-react'
import { usePlayer } from '../../context/PlayerContext'
import { useDownload } from '../../context/DownloadContext'
import { useTheme, type Theme } from '../../context/ThemeContext'
import { cn } from '@/lib/utils'

const THEME_CYCLE: Theme[] = ['dark', 'light', 'system']

interface UpdateInfo {
  available: boolean
  version?: string
  body?: string
  htmlUrl?: string
}

export default function TitleBar() {
  const { currentTrack } = usePlayer()
  const { downloads, isPopupExpanded, setIsPopupExpanded } = useDownload()
  const { theme, setTheme } = useTheme()
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdatePopup, setShowUpdatePopup] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    const removeUpdateListener = window.api.onUpdateAvailable((data) => {
      if (data.available) {
        setUpdateInfo(data)
      } else {
        setUpdateInfo(null)
      }
    })

    const removeProgressListener = window.api.onUpdateDownloadProgress((progress) => {
      setDownloadProgress(progress)
    })

    return () => {
      removeUpdateListener()
      removeProgressListener()
    }
  }, [])

  const activeDownloads = downloads.filter(d => d.status === 'downloading')
  const queuedDownloads = downloads.filter(d => d.status === 'queued')
  const activeCount = activeDownloads.length
  const queuedCount = queuedDownloads.length
  const totalPending = activeCount + queuedCount
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

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.htmlUrl) return
    setDownloadingUpdate(true)
    setDownloadProgress(0)
    try {
      await window.api.downloadUpdate(updateInfo.htmlUrl)
    } catch {
      setDownloadingUpdate(false)
    }
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
        className="flex items-center h-full gap-2 -mr-4 relative"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {updateInfo?.available && (
          <div className="relative">
            <button
              onClick={() => setShowUpdatePopup(!showUpdatePopup)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border cursor-pointer text-xs font-semibold transition-all select-none bg-green-500/15 border-green-500/30 hover:bg-green-500/25 text-green-400"
              title={`Update available: v${updateInfo.version}`}
            >
              <div className="size-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] hidden md:inline">v{updateInfo.version}</span>
            </button>

            {showUpdatePopup && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl p-4 z-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Update Available</h3>
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    v{updateInfo.version}
                  </span>
                </div>
                {updateInfo.body && (
                  <div className="text-xs text-muted-foreground leading-relaxed mb-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {updateInfo.body}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadUpdate}
                    disabled={downloadingUpdate}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {downloadingUpdate ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        Downloading {downloadProgress}%
                      </>
                    ) : (
                      <>
                        <ArrowDownToLine className="size-3" />
                        Install Update
                      </>
                    )}
                  </button>
                  {updateInfo.htmlUrl && (
                    <button
                      onClick={() => window.api.openExternal(updateInfo.htmlUrl!)}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
                    >
                      <ExternalLink className="size-3" />
                      View
                    </button>
                  )}
                </div>
                {downloadingUpdate && (
                  <div className="mt-2 w-full bg-muted h-1 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {totalPending > 0 && (
          <button
            onClick={() => setIsPopupExpanded(!isPopupExpanded)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-full border cursor-pointer text-xs font-semibold transition-all select-none',
              isPopupExpanded
                ? 'bg-primary/25 border-primary/50 text-primary shadow-sm'
                : 'bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary'
            )}
            title={`Downloading ${activeCount}, ${queuedCount} queued - Click to toggle download details`}
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
