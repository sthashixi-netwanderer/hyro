import { useDownload } from '../../context/DownloadContext'
import { Button } from '@/components/ui/button'
import { Download, X } from 'lucide-react'

export default function DownloadPopup() {
  const {
    downloads,
    activeCount,
    cancelDownload,
    isPopupExpanded,
    setIsPopupExpanded
  } = useDownload()

  const activeDownloads = downloads.filter((d) => d.status === 'downloading')

  // Disappear when no active downloads exist or popup is not toggled from titlebar
  if (activeCount === 0 || !isPopupExpanded) {
    return null
  }

  const overallProgress = Math.round(
    activeDownloads.reduce((sum, item) => sum + item.progress, 0) / activeCount
  )

  return (
    <div className="fixed top-9 right-32 z-50 w-80 shadow-2xl rounded-xl border border-border bg-card/95 backdrop-blur-md overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Integrated Header Bar anchored below TitleBar download button */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2">
          <Download className="size-4 text-primary animate-pulse" />
          <span className="text-xs font-semibold text-foreground">
            Downloading ({activeCount})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-primary font-bold">
            {overallProgress}%
          </span>
          <button
            type="button"
            onClick={() => setIsPopupExpanded(false)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Close popup"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Active Items List */}
      <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
        {activeDownloads.map((item) => (
          <div key={item.id} className="p-3 hover:bg-accent/20 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 relative size-5">
                <svg className="size-5 -rotate-90" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/20" />
                  <circle
                    cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"
                    className="text-primary transition-all duration-300"
                    strokeDasharray={`${2 * Math.PI * 10}`}
                    strokeDashoffset={`${2 * Math.PI * 10 * (1 - item.progress / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[7px] font-semibold tabular-nums text-primary font-mono">
                  {Math.round(item.progress)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate text-foreground">{item.trackName}</p>
                {item.totalTracks && item.totalTracks > 1 && (
                  <p className="text-[10px] text-muted-foreground">
                    Track {(item.trackIndex ?? 0) + 1} of {item.totalTracks}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-red-400"
                onClick={() => cancelDownload(item.id)}
                title="Cancel download"
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
