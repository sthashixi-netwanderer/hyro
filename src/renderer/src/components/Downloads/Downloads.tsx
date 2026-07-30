import { useState } from 'react'
import { useDownload, type DownloadItem } from '../../context/DownloadContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, CheckCircle2, XCircle, X, RotateCw, Trash2, Loader2, AlertCircle, Clock, ChevronDown, ChevronRight, Disc3, ListMusic } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Downloads() {
  const {
    downloads,
    activeCount,
    queuedCount,
    cancelDownload,
    retryDownload,
    dismissCompleted,
    dismissDownload
  } = useDownload()

  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set())

  const hasCompletedOrCancelled = downloads.some(
    (d) => d.status === 'done' || d.status === 'cancelled' || d.status === 'error'
  )

  // Identify container-level downloads (album/playlist parent entries)
  const containerIds = new Set(
    downloads.filter(d => d.type === 'album' || d.type === 'playlist').map(d => d.id)
  )

  // Get child track downloads for a container
  function getContainerChildren(containerId: string): DownloadItem[] {
    return downloads.filter(d => d.id.startsWith(containerId + ':'))
  }

  // Get container-level progress (average of children)
  function getContainerProgress(item: DownloadItem): number {
    if (item.progress > 0 && (item.status === 'done' || item.status === 'error')) return item.progress
    const children = getContainerChildren(item.id)
    if (children.length === 0) return item.progress
    const total = children.reduce((sum, c) => sum + c.progress, 0)
    return total / children.length
  }

  // Get overall status of a container's children
  function getContainerOverallStatus(item: DownloadItem): DownloadItem['status'] {
    const children = getContainerChildren(item.id)
    if (children.length === 0) return item.status
    if (children.every(c => c.status === 'done')) return 'done'
    if (children.some(c => c.status === 'error')) return 'error'
    if (children.some(c => c.status === 'downloading')) return 'downloading'
    if (children.some(c => c.status === 'queued')) return 'queued'
    if (children.every(c => c.status === 'cancelled')) return 'cancelled'
    return item.status
  }

  function toggleContainer(id: string) {
    setExpandedContainers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
      case 'queued':
        return 'Queued'
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
      case 'queued':
        return 'text-blue-400'
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
                ? `Downloading ${activeCount} track${activeCount > 1 ? 's' : ''}${queuedCount > 0 ? `, ${queuedCount} queued` : ''}`
                : queuedCount > 0
                  ? `${queuedCount} track${queuedCount > 1 ? 's' : ''} queued`
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
                    if (d.status === 'downloading' || d.status === 'queued') {
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
          {downloads
            .filter(item => {
              // Hide child items — they render inside their parent container
              for (const cid of containerIds) {
                if (item.id.startsWith(cid + ':')) return false
              }
              return true
            })
            .map((item) => {
              const isContainer = containerIds.has(item.id)
              const isExpanded = expandedContainers.has(item.id)
              const children = isContainer ? getContainerChildren(item.id) : []
              const containerProgress = isContainer ? getContainerProgress(item) : item.progress
              const containerStatus = isContainer ? getContainerOverallStatus(item) : item.status
              const doneCount = children.filter(c => c.status === 'done').length

              return (
                <div key={item.id}>
                  {/* Main row */}
                  <div
                    className={cn(
                      "flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-accent/25 border border-border rounded-xl hover:bg-accent/40 transition-colors",
                      containerStatus === 'downloading' && "border-primary/20 bg-primary/[0.02]",
                      containerStatus === 'queued' && "border-blue-500/20 bg-blue-500/[0.02] opacity-75",
                      isContainer && "cursor-pointer"
                    )}
                    onClick={isContainer ? () => toggleContainer(item.id) : undefined}
                  >
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isContainer && (
                          <span className="text-muted-foreground shrink-0">
                            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </span>
                        )}
                        {containerStatus === 'downloading' && (
                          <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                        )}
                        {containerStatus === 'done' && (
                          <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                        )}
                        {containerStatus === 'error' && (
                          <XCircle className="size-4 text-red-500 shrink-0" />
                        )}
                        {containerStatus === 'cancelled' && (
                          <XCircle className="size-4 text-muted-foreground shrink-0" />
                        )}
                        {containerStatus === 'interrupted' && (
                          <AlertCircle className="size-4 text-yellow-500 shrink-0" />
                        )}
                        {containerStatus === 'queued' && (
                          <Clock className="size-4 text-blue-400 shrink-0" />
                        )}
                        {isContainer ? (
                          <>
                            {item.type === 'album' ? (
                              <Disc3 className="size-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ListMusic className="size-4 text-muted-foreground shrink-0" />
                            )}
                            <Badge variant="secondary" className="text-[10px] uppercase px-1.5 py-0">
                              {item.type}
                            </Badge>
                          </>
                        ) : (
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                            {item.type}
                          </span>
                        )}
                        {isContainer && children.length > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {doneCount}/{children.length} tracks
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-foreground truncate" title={item.trackName}>
                        {item.trackName}
                      </h3>
                      {item.status === 'error' && item.error && (
                        <p className="text-xs text-red-500 mt-1 line-clamp-1">{item.error}</p>
                      )}
                      {containerStatus === 'downloading' && (
                        <div className="w-full max-w-md mt-2">
                          <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${containerProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions and Status */}
                    <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 border-t md:border-t-0 border-border pt-2.5 md:pt-0">
                      <div className="flex flex-col md:items-end">
                        <span className={cn("text-sm font-medium", getStatusColor(containerStatus))}>
                          {getStatusText({ ...item, status: containerStatus, progress: containerProgress })}
                        </span>
                        {containerStatus === 'downloading' && (
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            Progress: {Math.round(containerProgress)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {containerStatus === 'downloading' && (
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
                        {containerStatus === 'queued' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => cancelDownload(item.id)}
                            className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 size-8"
                            title="Remove from queue"
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                        {containerStatus === 'interrupted' && (
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
                        {(containerStatus === 'done' || containerStatus === 'cancelled' || containerStatus === 'error' || containerStatus === 'interrupted') && (
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

                  {/* Expanded children */}
                  {isContainer && isExpanded && children.length > 0 && (
                    <div className="ml-6 mt-1 flex flex-col gap-1 border-l-2 border-border pl-3">
                      {children.map((child) => (
                        <div
                          key={child.id}
                          className={cn(
                            "flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-accent/15 border border-border/50 rounded-lg hover:bg-accent/25 transition-colors",
                            child.status === 'downloading' && "border-primary/10",
                            child.status === 'done' && "border-green-500/10"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              {child.status === 'downloading' && (
                                <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                              )}
                              {child.status === 'done' && (
                                <CheckCircle2 className="size-3 text-green-500 shrink-0" />
                              )}
                              {child.status === 'error' && (
                                <XCircle className="size-3 text-red-500 shrink-0" />
                              )}
                              {child.status === 'cancelled' && (
                                <XCircle className="size-3 text-muted-foreground shrink-0" />
                              )}
                              {child.status === 'queued' && (
                                <Clock className="size-3 text-blue-400 shrink-0" />
                              )}
                              <span className="text-sm text-foreground truncate">{child.trackName}</span>
                            </div>
                            {child.status === 'error' && child.error && (
                              <p className="text-xs text-red-500 mt-0.5 line-clamp-1">{child.error}</p>
                            )}
                            {child.status === 'downloading' && (
                              <div className="w-full max-w-sm mt-1.5">
                                <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all duration-300"
                                    style={{ width: `${child.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={cn("text-xs font-medium", getStatusColor(child.status))}>
                              {getStatusText(child)}
                            </span>
                            <div className="flex items-center gap-1">
                              {child.status === 'downloading' && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => cancelDownload(child.id)}
                                  className="text-muted-foreground hover:text-red-400 size-6"
                                  title="Cancel"
                                >
                                  <X className="size-3" />
                                </Button>
                              )}
                              {child.status === 'queued' && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => cancelDownload(child.id)}
                                  className="text-muted-foreground hover:text-red-400 size-6"
                                  title="Remove"
                                >
                                  <X className="size-3" />
                                </Button>
                              )}
                              {(child.status === 'done' || child.status === 'cancelled' || child.status === 'error') && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => dismissDownload(child.id)}
                                  className="text-muted-foreground hover:text-foreground size-6"
                                  title="Clear"
                                >
                                  <X className="size-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
      </div>
    </div>
  )
}
