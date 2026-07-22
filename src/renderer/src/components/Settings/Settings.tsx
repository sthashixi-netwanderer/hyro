import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Key, ExternalLink, AlertCircle, Globe, Download, Loader2, RefreshCw } from 'lucide-react'

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

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setApiKey(settings.groqApiKey)
      setSavedApiKey(settings.groqApiKey)
      setCookieBrowser(settings.cookieBrowser)
      setSavedCookieBrowser(settings.cookieBrowser)
      setLoading(false)
    })
  }, [])

  // Check yt-dlp version on mount
  useEffect(() => {
    checkYtdlpUpdate()
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
        setYtdlpMessage(result.message || 'Update completed')
        setYtdlpCurrent(result.version)
        setYtdlpUpdateAvailable(false)
      } else {
        setYtdlpError(result.error || 'Update failed')
      }
    } catch {
      setYtdlpError('Failed to update yt-dlp')
    } finally {
      setYtdlpUpdating(false)
    }
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaved(false)
    try {
      await window.api.saveSettings({ groqApiKey: apiKey, cookieBrowser })
      setSavedApiKey(apiKey)
      setSavedCookieBrowser(cookieBrowser)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }, [apiKey, cookieBrowser])

  const hasChanges = apiKey !== savedApiKey || cookieBrowser !== savedCookieBrowser

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse-once space-y-6 max-w-2xl">
          <div className="h-8 w-48 bg-white/5 rounded" />
          <div className="h-4 w-96 bg-white/5 rounded" />
          <div className="h-40 bg-white/5 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">Configure app integrations and preferences.</p>

      {/* Groq API Key Section */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-6">
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
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-6 mt-4">
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
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-6 mt-4">
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

            {ytdlpUpdateAvailable && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={handleUpdateYtdlp}
                disabled={ytdlpUpdating}
              >
                {ytdlpUpdating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {ytdlpUpdating ? 'Updating...' : `Update to v${ytdlpLatest}`}
              </Button>
            )}

            {!ytdlpUpdateAvailable && ytdlpInstalled && ytdlpLatest && (
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
    </div>
  )
}
