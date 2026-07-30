import { logger } from '../../utils/logger'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Key, ExternalLink, AlertCircle, Globe, Download, Loader2, RefreshCw, Activity, Palette, Minimize2, Layers, ArrowDownToLine, Sparkles } from 'lucide-react'
import DataUsageModal from './DataUsageModal'
import type { DataUsageStats } from '../../../../shared/types'
import { formatBytes } from '../../../../shared/utils'
import { cn } from '@/lib/utils'
import ThemeToggle from '../ThemeToggle/ThemeToggle'

const BROWSER_OPTIONS = [
  { value: '', label: 'Disabled' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'edge', label: 'Edge' },
  { value: 'brave', label: 'Brave' },
  { value: 'chromium', label: 'Chromium' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' }
]

export default function Settings() {
  const [apiKey, setApiKey] = useState('')
  const [savedApiKey, setSavedApiKey] = useState('')
  const [cookieBrowser, setCookieBrowser] = useState('')
  const [savedCookieBrowser, setSavedCookieBrowser] = useState('')
  const [minimizeToTray, setMinimizeToTray] = useState(false)
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(1)
  const [savedMaxConcurrentDownloads, setSavedMaxConcurrentDownloads] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // yt-dlp state
  const [ytdlpInstalled, setYtdlpInstalled] = useState(false)
  const [ytdlpCurrent, setYtdlpCurrent] = useState<string | null>(null)
  const [ytdlpLatest, setYtdlpLatest] = useState<string | null>(null)
  const [ytdlpReleaseUrl, setYtdlpReleaseUrl] = useState<string | null>(null)
  const [ytdlpUpdateAvailable, setYtdlpUpdateAvailable] = useState(false)
  const [ytdlpInstallMethod, setYtdlpInstallMethod] = useState<string | null>(null)
  const [ytdlpChecking, setYtdlpChecking] = useState(false)
  const [ytdlpUpdating, setYtdlpUpdating] = useState(false)
  const [ytdlpMessage, setYtdlpMessage] = useState<string | null>(null)
  const [ytdlpError, setYtdlpError] = useState<string | null>(null)

  // App Update state
  const [appVersion, setAppVersion] = useState('')
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false)
  const [appUpdateVersion, setAppUpdateVersion] = useState('')
  const [appUpdateBody, setAppUpdateBody] = useState('')
  const [appUpdateUrl, setAppUpdateUrl] = useState('')
  const [appUpdateChecking, setAppUpdateChecking] = useState(false)
  const [appUpdateDownloading, setAppUpdateDownloading] = useState(false)
  const [appUpdateProgress, setAppUpdateProgress] = useState(0)

  // Data Usage state
  const [dataUsageStats, setDataUsageStats] = useState<DataUsageStats | null>(null)
  const [isDataUsageModalOpen, setIsDataUsageModalOpen] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setApiKey(settings.groqApiKey)
      setSavedApiKey(settings.groqApiKey)
      setCookieBrowser(settings.cookieBrowser)
      setSavedCookieBrowser(settings.cookieBrowser)
      setMinimizeToTray(!!settings.minimizeToTray)
      const concurrent = typeof settings.maxConcurrentDownloads === 'number' ? settings.maxConcurrentDownloads : 1
      setMaxConcurrentDownloads(concurrent)
      setSavedMaxConcurrentDownloads(concurrent)
      setLoading(false)
    })
  }, [])

  const handleToggleTray = useCallback(async (val: boolean) => {
    setMinimizeToTray(val)
    try {
      await window.api.saveSettings({ minimizeToTray: val })
    } catch (err) {
      logger.error('Failed to save minimize to tray setting:', err)
    }
  }, [])

  const handleConcurrentDownloadsChange = useCallback(async (val: number) => {
    const clamped = Math.max(1, Math.min(10, val))
    setMaxConcurrentDownloads(clamped)
    setSavedMaxConcurrentDownloads(clamped)
    try {
      await window.api.saveSettings({ maxConcurrentDownloads: clamped })
    } catch (err) {
      logger.error('Failed to save concurrent downloads setting:', err)
    }
  }, [])

  // Check yt-dlp version on mount
  useEffect(() => {
    checkYtdlpUpdate()
  }, [])

  const loadDataUsageStats = useCallback(async () => {
    try {
      const stats = await window.api.getDataUsage()
      setDataUsageStats(stats)
    } catch (err) {
      logger.error('Failed to load data usage stats:', err)
    }
  }, [])

  useEffect(() => {
    loadDataUsageStats()
    // Load app version
    window.api.getAppVersion().then(setAppVersion).catch(() => {})
    // Listen for update notifications
    const removeUpdateListener = window.api.onUpdateAvailable((data) => {
      if (data.available) {
        setAppUpdateAvailable(true)
        setAppUpdateVersion(data.version || '')
        setAppUpdateBody(data.body || '')
        setAppUpdateUrl(data.htmlUrl || '')
      } else {
        setAppUpdateAvailable(false)
      }
    })
    const removeProgressListener = window.api.onUpdateDownloadProgress((progress) => {
      setAppUpdateProgress(progress)
    })
    return () => {
      removeUpdateListener()
      removeProgressListener()
    }
  }, [loadDataUsageStats])

  const handleCheckAppUpdate = useCallback(async () => {
    setAppUpdateChecking(true)
    try {
      const result = await window.api.checkForUpdate()
      if (result.available) {
        setAppUpdateAvailable(true)
        setAppUpdateVersion(result.version || '')
        setAppUpdateBody(result.body || '')
        setAppUpdateUrl(result.htmlUrl || '')
      } else {
        setAppUpdateAvailable(false)
      }
    } catch {
      // silently fail
    } finally {
      setAppUpdateChecking(false)
    }
  }, [])

  const handleDownloadAppUpdate = useCallback(async () => {
    if (!appUpdateUrl) return
    setAppUpdateDownloading(true)
    setAppUpdateProgress(0)
    try {
      await window.api.downloadUpdate(appUpdateUrl)
    } catch {
      setAppUpdateDownloading(false)
    }
  }, [appUpdateUrl])

  const handleResetDataUsage = useCallback(async () => {
    try {
      const resetStats = await window.api.resetDataUsage()
      setDataUsageStats(resetStats)
    } catch (err) {
      logger.error('Failed to reset data usage:', err)
    }
  }, [])

  const checkYtdlpUpdate = useCallback(async () => {
    setYtdlpChecking(true)
    setYtdlpMessage(null)
    setYtdlpError(null)
    try {
      const result = await window.api.checkYtDlpUpdate()
      setYtdlpInstalled(result.installed)
      setYtdlpCurrent(result.currentVersion)
      setYtdlpLatest(result.latestVersion)
      setYtdlpReleaseUrl(result.releaseUrl)
      setYtdlpUpdateAvailable(result.updateAvailable)
      setYtdlpInstallMethod(result.installMethod)
      if (!result.installed) {
        setYtdlpError('yt-dlp is not installed or not found on PATH')
      }
    } catch {
      setYtdlpError('Failed to check for updates')
    } finally {
      setYtdlpChecking(false)
    }
  }, [])

  const handleUpdateYtdlp = useCallback(async () => {
    setYtdlpUpdating(true)
    setYtdlpMessage(null)
    setYtdlpError(null)
    try {
      const result = await window.api.updateYtDlp()
      if (result.success) {
        setYtdlpMessage(result.message || 'Update completed successfully')
        if (result.version) setYtdlpCurrent(result.version)
        await checkYtdlpUpdate()
      } else {
        setYtdlpError(result.error || result.message || 'Update failed')
      }
    } catch (err: any) {
      setYtdlpError(err?.message || 'Failed to update yt-dlp')
    } finally {
      setYtdlpUpdating(false)
    }
  }, [checkYtdlpUpdate])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaved(false)
    try {
      await window.api.saveSettings({ groqApiKey: apiKey, cookieBrowser, maxConcurrentDownloads })
      setSavedApiKey(apiKey)
      setSavedCookieBrowser(cookieBrowser)
      setSavedMaxConcurrentDownloads(maxConcurrentDownloads)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }, [apiKey, cookieBrowser, maxConcurrentDownloads])

  const hasChanges = apiKey !== savedApiKey || cookieBrowser !== savedCookieBrowser || maxConcurrentDownloads !== savedMaxConcurrentDownloads

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse-once space-y-6 max-w-2xl mx-auto">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
          <div className="h-40 bg-muted rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/20">
        <div className="max-w-2xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure app integrations and preferences.</p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto w-full space-y-4">
        {/* Appearance / Theme Section */}
        <div className="rounded-2xl bg-card/60 border border-border/80 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Palette className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">App Theme</h2>
              <p className="text-xs text-muted-foreground">Customize application color scheme & mode</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Choose your preferred visual theme for Hyro Music. System Default automatically matches your system's light or dark mode.
            </p>

            <ThemeToggle variant="inline" className="mt-2" />
          </div>
        </div>

        {/* App Updates Section */}
        <div className="rounded-2xl bg-card border border-border/80 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="size-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">App Updates</h2>
                <p className="text-xs text-muted-foreground">Check for and install the latest version of Hyro Music</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckAppUpdate}
              disabled={appUpdateChecking || appUpdateDownloading}
              className="text-xs h-9 shrink-0"
            >
              {appUpdateChecking ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="size-4 mr-2" />
              )}
              Check for Updates
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Current version:</span>
              <span className="font-mono text-foreground bg-secondary px-2 py-0.5 rounded">v{appVersion || '...'}</span>
            </div>

            {appUpdateAvailable ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-sm font-semibold text-green-400">Update Available</span>
                  </div>
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    v{appUpdateVersion}
                  </span>
                </div>
                {appUpdateBody && (
                  <div className="text-xs text-muted-foreground leading-relaxed mb-3 max-h-24 overflow-y-auto whitespace-pre-wrap">
                    {appUpdateBody}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleDownloadAppUpdate}
                    disabled={appUpdateDownloading}
                    className="text-xs h-8"
                  >
                    {appUpdateDownloading ? (
                      <Loader2 className="size-3 animate-spin mr-2" />
                    ) : (
                      <ArrowDownToLine className="size-3 mr-2" />
                    )}
                    {appUpdateDownloading ? `Downloading ${appUpdateProgress}%` : 'Install Update'}
                  </Button>
                  {appUpdateUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.api.openExternal(appUpdateUrl)}
                      className="text-xs h-8"
                    >
                      <ExternalLink className="size-3 mr-1" />
                      View Release
                    </Button>
                  )}
                </div>
                {appUpdateDownloading && (
                  <div className="mt-3 w-full bg-muted h-1 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${appUpdateProgress}%` }}
                    />
                  </div>
                )}
              </div>
            ) : appUpdateChecking ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Checking for updates...
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                You are running the latest version.
              </div>
            )}
          </div>
        </div>

        {/* System Tray & Background Playback Section */}
        <div className="rounded-2xl bg-card border border-border/80 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Minimize2 className="size-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Minimize to System Tray on Close</h2>
                <p className="text-xs text-muted-foreground">Keep playing tracks in background when closing app window</p>
              </div>
            </div>

            {/* Switch Toggle */}
            <button
              role="switch"
              aria-checked={minimizeToTray}
              onClick={() => handleToggleTray(!minimizeToTray)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                minimizeToTray ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                  minimizeToTray ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-3 pt-3 border-t border-border/40">
            When enabled, closing the window hides Hyro Music to the system tray so your music continues playing without interruption. Right-click the tray icon to show controls or exit.
          </p>
        </div>

        {/* Concurrent Downloads Section */}
        <div className="rounded-2xl bg-card border border-border/80 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Layers className="size-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Concurrent Downloads</h2>
                <p className="text-xs text-muted-foreground">Number of tracks to download simultaneously</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                className="size-8"
                onClick={() => handleConcurrentDownloadsChange(maxConcurrentDownloads - 1)}
                disabled={maxConcurrentDownloads <= 1}
              >
                -
              </Button>
              <span className="text-sm font-mono font-semibold text-foreground w-6 text-center">
                {maxConcurrentDownloads}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-8"
                onClick={() => handleConcurrentDownloadsChange(maxConcurrentDownloads + 1)}
                disabled={maxConcurrentDownloads >= 10}
              >
                +
              </Button>
              <Button
                variant={saved && maxConcurrentDownloads === savedMaxConcurrentDownloads ? 'default' : 'outline'}
                size="default"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="shrink-0 min-w-[80px] ml-2"
              >
                {saved && maxConcurrentDownloads === savedMaxConcurrentDownloads ? (
                  <span className="flex items-center gap-1.5"><Check className="size-3.5" /> Saved</span>
                ) : saving ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-3 pt-3 border-t border-border/40">
            Controls how many tracks download at the same time. Higher values use more bandwidth and disk I/O. Default is 1 (sequential).
          </p>
        </div>

        {/* Groq API Key Section */}
      <div className="rounded-2xl bg-card border border-border/80 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Key className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Groq API Key</h2>
            <p className="text-xs text-muted-foreground">Used for AI-powered lyrics title cleaning</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            When configured, Hyro uses the Groq API to intelligently clean track titles before
            searching for synced lyrics. This removes YouTube suffixes like "Official Video",
            "4K", "Lyric Video" etc. that cause lyrics lookups to fail.
          </p>

          <div className="flex gap-2 items-center">
            <Input
              type="password"
              placeholder="gsk_..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setSaved(false)
              }}
              className="flex-1 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hasChanges) handleSave()
              }}
            />
            <Button
              variant={saved ? 'default' : 'outline'}
              size="default"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="shrink-0 min-w-[80px]"
            >
              {saved ? (
                <span className="flex items-center gap-1.5"><Check className="size-3.5" /> Saved</span>
              ) : saving ? (
                'Saving…'
              ) : (
                'Save'
              )}
            </Button>
          </div>

          {savedApiKey && (
            <div className="flex items-center gap-1.5 text-xs text-primary/80">
              <Check className="size-3" />
              <span>API key configured</span>
            </div>
          )}

          <div className="flex items-start gap-2 mt-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <AlertCircle className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p>
                Get a free API key from{' '}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  console.groq.com/keys
                  <ExternalLink className="size-2.5" />
                </a>
              </p>
              <p className="mt-1.5">
                Without an API key, a built-in regex cleaner is used instead — it handles
                common cases but is less accurate than the AI model.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Browser Cookies Section */}
      <div className="rounded-2xl bg-card border border-border/80 p-6 mt-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Globe className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Browser Cookies</h2>
            <p className="text-xs text-muted-foreground">Use browser session for YouTube requests</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            When enabled, yt-dlp loads cookies from your browser session. This helps avoid
            YouTube rate limits and consent blocks that cause tracks to skip. Your cookies
            are never sent anywhere — they stay on your machine.
          </p>

          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Browser:</label>
            <select
              value={cookieBrowser}
              onChange={(e) => setCookieBrowser(e.target.value)}
              className="flex-1 h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
            >
              {BROWSER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {cookieBrowser && (
            <div className="flex items-center gap-1.5 text-xs text-primary/80">
              <Check className="size-3" />
              <span>Using {cookieBrowser} cookies for YouTube requests</span>
            </div>
          )}

          <div className="flex items-start gap-2 mt-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <AlertCircle className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p>
                Make sure you are logged into YouTube in your selected browser. If tracks
                still skip, try opening YouTube in that browser and completing any consent
                or captcha prompts first.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* yt-dlp Section */}
      <div className="rounded-2xl bg-card border border-border/80 p-6 mt-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">yt-dlp</h2>
            <p className="text-xs text-muted-foreground">Audio stream and download engine</p>
          </div>
          {ytdlpInstalled && ytdlpCurrent && (
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              v{ytdlpCurrent}
            </span>
          )}
          {ytdlpInstalled && ytdlpInstallMethod && (
            <span className="text-xs text-muted-foreground/60 ml-1">
              ({ytdlpInstallMethod === 'pip' ? 'pip' : ytdlpInstallMethod === 'pipx' ? 'pipx' : ytdlpInstallMethod === 'homebrew' ? 'Homebrew' : 'standalone'})
            </span>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            yt-dlp is used for streaming and downloading audio from YouTube. Keeping it
            updated ensures compatibility and fixes playback issues.
          </p>

          {!ytdlpInstalled && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-destructive">
                <p className="font-medium">yt-dlp not found</p>
                <p className="mt-1 opacity-80">
                  Install it from{' '}
                  <a href="https://github.com/yt-dlp/yt-dlp#installation" target="_blank" rel="noreferrer" className="underline">
                    the official repository
                  </a>{' '}
                  and restart the app.
                </p>
              </div>
            </div>
          )}

          {ytdlpMessage && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <Check className="size-4 text-primary shrink-0" />
              <span className="text-xs text-primary">{ytdlpMessage}</span>
            </div>
          )}

          {ytdlpError && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
              <AlertCircle className="size-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">{ytdlpError}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={checkYtdlpUpdate}
              disabled={ytdlpChecking || ytdlpUpdating}
            >
              {ytdlpChecking ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {ytdlpChecking ? 'Checking...' : 'Check for updates'}
            </Button>

            {ytdlpInstalled && (
              <Button
                variant={ytdlpUpdateAvailable ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={handleUpdateYtdlp}
                disabled={ytdlpUpdating || ytdlpChecking}
              >
                {ytdlpUpdating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {ytdlpUpdating
                  ? 'Updating yt-dlp…'
                  : ytdlpUpdateAvailable
                  ? `Update to v${ytdlpLatest}`
                  : 'Update yt-dlp'}
              </Button>
            )}

            {!ytdlpUpdateAvailable && ytdlpInstalled && ytdlpLatest && !ytdlpUpdating && (
              <span className="text-xs text-muted-foreground">
                Up to date
              </span>
            )}

            {ytdlpReleaseUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 ml-auto"
                onClick={() => window.api.openExternal(ytdlpReleaseUrl)}
              >
                <ExternalLink className="size-3.5" />
                Release notes
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Data Usage Section */}
      <div className="rounded-2xl bg-card border border-border/80 p-6 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Data Usage Tracker</h2>
              <p className="text-xs text-muted-foreground">Monitor network data used during track playback & caching</p>
            </div>
          </div>
          {dataUsageStats && (
            <span className="text-xs font-bold font-mono text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-xl">
              {formatBytes(dataUsageStats.totalBytes)}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Track total bandwidth consumed while playing online audio streams, pre-caching queue tracks,
            and downloading songs to your library.
          </p>

          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-muted-foreground">
              Tracks Played: <strong className="text-foreground font-mono">{dataUsageStats?.tracksPlayedCount || 0}</strong>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsDataUsageModalOpen(true)}
              className="gap-2 text-xs font-semibold rounded-xl"
            >
              <Activity className="size-3.5" />
              Track Data Usage
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <DataUsageModal
    isOpen={isDataUsageModalOpen}
    onClose={() => setIsDataUsageModalOpen(false)}
    stats={dataUsageStats}
    onRefresh={loadDataUsageStats}
    onReset={handleResetDataUsage}
  />
</div>
  )
}
