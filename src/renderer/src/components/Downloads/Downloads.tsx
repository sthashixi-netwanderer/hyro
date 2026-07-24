import { useDownload, type DownloadItem } from '../../context/DownloadContext'
import { Button } from '@/components/ui/button'
import { Download, CheckCircle2, XCircle, X, RotateCw, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Downloads() {
  const {
    downloads,
    activeCount,
    cancelDownload,
    retryDownload,
    dismissCompleted,
    dismissDownload
  } = useDownload()

  const hasCompletedOrCancelled = downloads.some(
    (d) => d.status === 'done' || d.status === 'cancelled' || d.status === 'error'
  )

  const getStatusText = (item: DownloadItem) => {
    switch (item.status) {
      case 'downloading':
        return `Downloading... ${Math.round(item.progress)}%`
      case 'done':
        return 'Completed'
      case 'error':
        return item.error || 'Failed'
      case 'cancelled':
        return 'Cancelled'
      case 'interrupted':
        return 'Interrupted'
      default:
        return 'Pending'
    }
  }

  const getStatusColor = (status: DownloadItem['status']) => {
    switch (status) {
      case 'downloading':
        return 'text-primary'
      case 'done':
        return 'text-green-500'
      case 'error':
        return 'text-red-500'
      case 'cancelled':
        return 'text-muted-foreground'
      case 'interrupted':
        return 'text-yellow-500'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Downloads</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount > 0
                ? `Currently downloading ${activeCount} track${activeCount > 1 ? 's' : ''}`
                : 'Manage and monitor your offline tracks download queue'
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasCompletedOrCancelled && (
              <Button
                variant="outline"
                size="sm"
                onClick={dismissCompleted}
                className="text-xs h-9"
              >
                <Trash2 className="size-4 mr-2" />
                Clear Completed
              </Button>
            )}
            {activeCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  downloads.forEach(d => {
                    if (d.status === 'downloading') {
                      cancelDownload(d.id)
                    }
                  })
                }}
                className="text-xs h-9"
              >
                <X className="size-4 mr-2" />
                Cancel All
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

      {downloads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-secondary/10 border border-dashed border-border rounded-xl">
          <div className="p-4 rounded-full bg-secondary/40 text-muted-foreground mb-4">
            <Download className="size-10 opacity-30" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Your download queue is empty</h3>
          <p className="text-sm text-muted-foreground max-w-[320px]">
            Go search or browse tracks and click the download option to listen to them offline.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {downloads.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-accent/25 border border-border rounded-xl hover:bg-accent/40 transition-colors",
                item.status === 'downloading' && "border-primary/20 bg-primary/[0.02]"
              )}
            >
              {/* Left: Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {item.status === 'downloading' && (
                    <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                  )}
                  {item.status === 'done' && (
                    <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                  )}
                  {item.status === 'error' && (
                    <XCircle className="size-4 text-red-500 shrink-0" />
                  )}
                  {item.status === 'cancelled' && (
                    <XCircle className="size-4 text-muted-foreground shrink-0" />
                  )}
                  {item.status === 'interrupted' && (
                    <AlertCircle className="size-4 text-yellow-500 shrink-0" />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                    {item.type}
                  </span>
                  {item.totalTracks && item.totalTracks > 1 && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      (Track {(item.trackIndex ?? 0) + 1} of {item.totalTracks})
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-foreground truncate" title={item.trackName}>
                  {item.trackName}
                </h3>
                {item.status === 'error' && item.error && (
                  <p className="text-xs text-red-500 mt-1 line-clamp-1">{item.error}</p>
                )}
                {item.status === 'downloading' && (
                  <div className="w-full max-w-md mt-2">
                    <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Actions and Status */}
              <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 border-t md:border-t-0 border-border pt-2.5 md:pt-0">
                <div className="flex flex-col md:items-end">
                  <span className={cn("text-sm font-medium", getStatusColor(item.status))}>
                    {getStatusText(item)}
                  </span>
                  {item.status === 'downloading' && (
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      Progress: {Math.round(item.progress)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {item.status === 'downloading' && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => cancelDownload(item.id)}
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 size-8"
                      title="Cancel"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                  {item.status === 'interrupted' && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => retryDownload(item)}
                      className="text-muted-foreground hover:text-yellow-400 hover:bg-yellow-500/10 size-8"
                      title="Retry"
                    >
                      <RotateCw className="size-4" />
                    </Button>
                  )}
                  {(item.status === 'done' || item.status === 'cancelled' || item.status === 'error' || item.status === 'interrupted') && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => dismissDownload(item.id)}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent size-8"
                      title="Clear from list"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
