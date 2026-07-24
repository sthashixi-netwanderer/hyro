import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  X,
  Activity,
  Radio,
  Zap,
  Download,
  Clock,
  Trash2,
  RefreshCw,
  Info,
  Disc3,
  Calendar,
  AlertTriangle
} from 'lucide-react'
import type { DataUsageStats, TimeframeUsage } from '../../../../shared/types'
import { formatBytes } from '../../../../shared/utils'

interface DataUsageModalProps {
  isOpen: boolean
  onClose: () => void
  stats: DataUsageStats | null
  onRefresh: () => Promise<void>
  onReset: () => Promise<void>
}

type TimeframeFilter = 'today' | 'thisWeek' | 'thisMonth' | 'allTime'

export default function DataUsageModal({
  isOpen,
  onClose,
  stats,
  onRefresh,
  onReset
}: DataUsageModalProps) {
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('allTime')
  const [refreshing, setRefreshing] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  if (!isOpen || !stats) return null

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setTimeout(() => setRefreshing(false), 400)
    }
  }

  const handleReset = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true)
      return
    }
    setResetting(true)
    try {
      await onReset()
      setConfirmingReset(false)
    } finally {
      setResetting(false)
    }
  }

  // Determine active metrics based on selected timeframe
  let activeUsage: TimeframeUsage = {
    totalBytes: stats.totalBytes,
    streamingBytes: stats.streamingBytes,
    cacheBytes: stats.cacheBytes,
    downloadBytes: stats.downloadBytes,
    tracksPlayedCount: stats.tracksPlayedCount
  }
  let timeframeTitle = 'All-Time Consumption'

  if (timeframe === 'today') {
    activeUsage = stats.today || activeUsage
    timeframeTitle = 'Today\'s Data Usage'
  } else if (timeframe === 'thisWeek') {
    activeUsage = stats.thisWeek || activeUsage
    timeframeTitle = 'This Week\'s Data Usage (7 Days)'
  } else if (timeframe === 'thisMonth') {
    activeUsage = stats.thisMonth || activeUsage
    timeframeTitle = 'This Month\'s Data Usage (30 Days)'
  }

  // Calculate usage tier for visual badge
  const totalMB = activeUsage.totalBytes / (1024 * 1024)
  let tierLabel = 'Light'
  let tierColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'

  if (totalMB > 1024) {
    tierLabel = 'Heavy'
    tierColor = 'bg-purple-500/20 text-purple-400 border-purple-500/30'
  } else if (totalMB > 250) {
    tierLabel = 'Moderate'
    tierColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  }

  const avgPerTrack =
    activeUsage.tracksPlayedCount > 0
      ? activeUsage.totalBytes / activeUsage.tracksPlayedCount
      : 0

  // Build 7-day daily activity breakdown array
  const last7Days: { dayLabel: string; dateStr: string; bytes: number; isToday: boolean }[] = []
  const now = new Date()
  let maxDailyBytes = 1

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000)
    const dateStr = d.toISOString().split('T')[0]
    const dayLabel = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })
    const rec = stats.dailyHistory?.[dateStr]
    const bytes = rec ? (rec.streamingBytes || 0) + (rec.cacheBytes || 0) + (rec.downloadBytes || 0) : 0
    if (bytes > maxDailyBytes) maxDailyBytes = bytes
    last7Days.push({ dayLabel, dateStr, bytes, isToday: i === 0 })
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Modal backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Dialog Container */}
      <div className="relative w-full max-w-xl max-h-[80vh] sm:max-h-[85vh] bg-[#121212] border border-white/10 rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col">
        {/* Fixed Top Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 shrink-0 bg-[#121212] z-10">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Activity className="size-5 text-primary animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                Data Usage Tracker
              </h2>
              <p className="text-xs text-muted-foreground">
                Track network bandwidth consumed during playback & caching
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full size-9 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {/* Timeframe Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'thisWeek', label: 'This Week' },
                { id: 'thisMonth', label: 'This Month' },
                { id: 'allTime', label: 'All Time' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTimeframe(tab.id)}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-xl transition-all ${
                  timeframe === tab.id
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Hero Consumption Banner */}
          <div className="relative rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" />
                  {timeframeTitle}
                </span>
                <div className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight mt-1 font-mono">
                  {formatBytes(activeUsage.totalBytes)}
                </div>
              </div>
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full border ${tierColor}`}
              >
                {tierLabel}
              </span>
            </div>

            {/* Quick Info Badges */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-white/[0.06]">
              <span className="flex items-center gap-1.5">
                <Disc3 className="size-3.5 text-primary" />
                Tracks Played: <strong className="text-foreground">{activeUsage.tracksPlayedCount}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5 text-emerald-400" />
                Avg / Song: <strong className="text-foreground">{formatBytes(avgPerTrack)}</strong>
              </span>
            </div>
          </div>

          {/* 7-Day Activity Chart */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="font-semibold text-foreground">7-Day Activity Breakdown</span>
              <span>Last 7 Days</span>
            </div>
            <div className="flex items-end justify-between gap-2 h-20 pt-2 px-1">
              {last7Days.map((item) => {
                const heightPercent = Math.max(8, Math.round((item.bytes / maxDailyBytes) * 100))
                return (
                  <div key={item.dateStr} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <div className="w-full flex justify-center items-end h-full">
                      <div
                        className={`w-full max-w-[28px] rounded-t-lg transition-all duration-300 ${
                          item.isToday
                            ? 'bg-primary shadow-[0_0_10px_rgba(29,185,84,0.4)]'
                            : item.bytes > 0
                            ? 'bg-white/20 group-hover:bg-primary/70'
                            : 'bg-white/5'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                        title={`${item.dayLabel}: ${formatBytes(item.bytes)}`}
                      />
                    </div>
                    <span className={`text-[10px] font-mono ${item.isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {item.dayLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Live Streaming */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-2">
                <Radio className="size-4 text-primary" />
                <span>Live Streaming</span>
              </div>
              <div className="text-xl font-bold text-foreground font-mono">
                {formatBytes(activeUsage.streamingBytes)}
              </div>
              <span className="text-[10px] text-muted-foreground/70 mt-1">Web audio streams</span>
            </div>

            {/* Pre-Cache Buffer */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-2">
                <Zap className="size-4 text-amber-400" />
                <span>Queue Pre-Cache</span>
              </div>
              <div className="text-xl font-bold text-foreground font-mono">
                {formatBytes(activeUsage.cacheBytes)}
              </div>
              <span className="text-[10px] text-muted-foreground/70 mt-1">Background buffering</span>
            </div>

            {/* Library Downloads */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-2">
                <Download className="size-4 text-blue-400" />
                <span>Music Downloads</span>
              </div>
              <div className="text-xl font-bold text-foreground font-mono">
                {formatBytes(activeUsage.downloadBytes)}
              </div>
              <span className="text-[10px] text-muted-foreground/70 mt-1">MP3 file downloads</span>
            </div>

            {/* Active Session */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-2">
                <Clock className="size-4 text-purple-400" />
                <span>Active Session</span>
              </div>
              <div className="text-xl font-bold text-foreground font-mono">
                {formatBytes(stats.sessionBytes)}
              </div>
              <span className="text-[10px] text-muted-foreground/70 mt-1">Since app launch</span>
            </div>
          </div>

          {/* Tip Box */}
          <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Playing tracks from your offline library consumes zero network data. Pre-caching buffers upcoming queue tracks for continuous playback.
            </p>
          </div>
        </div>

        {/* Fixed Bottom Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#121212] shrink-0 z-10">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5 text-xs rounded-xl"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            {confirmingReset ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReset}
                  disabled={resetting}
                  className="gap-1.5 text-xs rounded-xl"
                >
                  <AlertTriangle className="size-3.5" />
                  Confirm Clear
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingReset(false)}
                  className="text-xs rounded-xl text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="gap-1.5 text-xs text-muted-foreground hover:text-destructive rounded-xl"
              >
                <Trash2 className="size-3.5" />
                Clear Data Usage
              </Button>
            )}
          </div>

          <Button
            variant="default"
            size="sm"
            onClick={onClose}
            className="rounded-xl px-5 text-xs font-semibold"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
