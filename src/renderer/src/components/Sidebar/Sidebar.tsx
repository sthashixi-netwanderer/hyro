import { useState } from 'react'
import { Home, Search, ListMusic, Library, Clock, Plus, Settings, Download, User, Music, PlusCircle } from 'lucide-react'
import type { ViewType } from '../../../../shared/types'
import { ASCII_LOGO } from '../../../../shared/asciiLogo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePlayer } from '../../context/PlayerContext'
import { useFavorites } from '../../context/FavoritesContext'
import { useLikedSongs } from '../../context/LikedSongsContext'
import { usePlaylists } from '../../context/PlaylistsContext'
import { bestThumbnailUrl } from '../../../../shared/utils'
import ThemeToggle from '../ThemeToggle/ThemeToggle'
import CachedImage from '@/components/ui/CachedImage'
import PlaylistDialog from '../ui/PlaylistDialog'

interface SidebarProps {
  currentView: ViewType
  currentViewData?: string | null
  onNavigate: (view: ViewType, id?: string) => void
}

const navItems: { view: ViewType; label: string; icon: React.ReactNode }[] = [
  { view: 'home', label: 'Home', icon: <Home className="size-5" /> },
  { view: 'search', label: 'Search', icon: <Search className="size-5" /> },
  { view: 'queue', label: 'Queue', icon: <ListMusic className="size-5" /> },
  { view: 'library', label: 'Library', icon: <Library className="size-5" /> },
  { view: 'downloads', label: 'Downloads', icon: <Download className="size-5" /> },
  { view: 'history', label: 'History', icon: <Clock className="size-5" /> },
  { view: 'likedSongs', label: 'Liked Songs', icon: <Music className="size-5" /> },
  { view: 'playlists', label: 'Playlists', icon: <ListMusic className="size-5" /> }
]

export default function Sidebar({ currentView, currentViewData, onNavigate }: SidebarProps) {
  const { isPlaying, currentTrack, queue, queueIndex } = usePlayer()
  const { favorites } = useFavorites()
  const { tracks: likedSongs } = useLikedSongs()
  const { playlists } = usePlaylists()
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const followedArtists = favorites.filter((f) => f.type === 'artist')

  const tracksLeft = queueIndex >= 0 ? Math.max(0, queue.length - 1 - queueIndex) : queue.length

  return (
    <aside
      className="w-[220px] shrink-0 bg-secondary border-r border-border flex flex-col"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 pt-6 pb-4 select-none" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex flex-col items-center justify-center gap-3">
          <img
            src="/icon.png"
            alt="Hyro"
            className="size-12 rounded-xl shadow-lg ring-1 ring-border/20 object-contain"
            draggable={false}
          />
          <pre className="font-mono text-[5.5px] leading-[1.1] text-primary whitespace-pre overflow-hidden drop-shadow-[0_0_10px_rgba(29,185,84,0.3)]">
            {ASCII_LOGO}
          </pre>
          <div className="text-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Music</span>
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {navItems.map(({ view, label, icon }) => (
          <Button
            key={view}
            variant="ghost"
            className={cn(
              'w-full justify-start gap-3 px-3 text-sm font-medium',
              currentView === view ||
              (view === 'library' && (currentView === 'library' || currentView === 'libraryContainer')) ||
              (view === 'likedSongs' && currentView === 'favorites') ||
              (view === 'playlists' && (currentView === 'playlists' || currentView === 'userPlaylist'))
                ? 'bg-accent text-accent-foreground'
                : 'text-secondary-foreground hover:text-foreground'
            )}
            onClick={() => onNavigate(view)}
          >
            {icon}
            {label}
            {view === 'queue' && (
              <div className="ml-auto flex items-center gap-1.5">
                {tracksLeft > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-primary/20 text-primary rounded-full tabular-nums">
                    {tracksLeft}
                  </span>
                )}
                {isPlaying && currentTrack && (
                  <span className="spectrum-bars">
                    <span /><span /><span />
                  </span>
                )}
              </div>
            )}
          </Button>
        ))}
      </nav>

      {/* Playlists Section */}
      <div
        className="flex flex-col gap-1 px-3 pt-3 mt-3 border-t border-border/50 flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-muted-foreground/20"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between shrink-0">
          <span>Playlists</span>
          <button
            className="size-5 flex items-center justify-center rounded hover:bg-accent transition-colors"
            onClick={() => setShowCreatePlaylist(true)}
            title="Create playlist"
          >
            <PlusCircle className="size-3.5" />
          </button>
        </div>
        <div className="space-y-0.5 pb-2">
          {playlists.map((playlist) => {
            const isSelected = currentView === 'userPlaylist' && currentViewData === playlist.id
            return (
              <button
                key={playlist.id}
                onClick={() => onNavigate('userPlaylist', playlist.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors text-left group shrink-0',
                  isSelected
                    ? 'bg-accent text-accent-foreground font-semibold'
                    : 'text-secondary-foreground hover:bg-accent/50 hover:text-foreground'
                )}
                title={playlist.name}
              >
                <div className="size-6 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                  {playlist.thumbnailUrl ? (
                    <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
                  ) : (
                    <ListMusic className="size-3 text-muted-foreground" />
                  )}
                </div>
                <span className="truncate text-xs flex-1 group-hover:text-foreground">
                  {playlist.name}
                </span>
                <span className="text-[10px] text-muted-foreground/70 font-mono bg-muted/60 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                  {playlist.tracks.length}
                </span>
              </button>
            )
          })}
          {playlists.length === 0 && (
            <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground/60">
              No playlists yet
            </p>
          )}
        </div>
      </div>

      {followedArtists.length > 0 && (
        <div
          className="flex flex-col gap-1 px-3 pt-3 mt-3 border-t border-border/50 flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-muted-foreground/20"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between shrink-0">
            <span>Artists</span>
            <span className="text-[10px] text-muted-foreground/60">{followedArtists.length}</span>
          </div>
          <div className="space-y-0.5 pb-2">
            {followedArtists.map((item) => {
              const artistData = item.data || {}
              const artistName = artistData.name || 'Unknown Artist'
              const artistImg = bestThumbnailUrl(artistData.thumbnails)
              const trackCount = artistData.totalTracks || artistData.songs?.length || 0
              const isSelected = currentView === 'artist' && (currentViewData === item.id || currentViewData === artistData.artistId)
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate('artist', artistData.artistId || item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors text-left group shrink-0',
                    isSelected
                      ? 'bg-accent text-accent-foreground font-semibold'
                      : 'text-secondary-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                  title={`${artistName}${trackCount > 0 ? ` (${trackCount} tracks)` : ''}`}
                >
                  <div className="size-6 rounded-full overflow-hidden bg-muted shrink-0 flex items-center justify-center border border-border/40 shadow-sm">
                    <CachedImage
                      src={artistImg}
                      alt={artistName}
                      className="w-full h-full object-cover"
                      fallbackIcon={<User className="size-3 text-muted-foreground" />}
                    />
                  </div>
                  <span className="truncate text-xs flex-1 group-hover:text-foreground">
                    {artistName}
                  </span>
                  {trackCount > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono bg-muted/60 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                      {trackCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="px-3 pb-3 mt-auto pt-2 shrink-0 space-y-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <ThemeToggle variant="sidebar" align="start" side="top" />
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-3 px-3 text-sm font-medium',
            currentView === 'settings'
              ? 'bg-accent text-accent-foreground'
              : 'text-secondary-foreground hover:text-foreground'
          )}
          onClick={() => onNavigate('settings')}
        >
          <Settings className="size-5" />
          Settings
        </Button>
      </div>
      <PlaylistDialog
        open={showCreatePlaylist}
        onOpenChange={setShowCreatePlaylist}
        mode="create"
      />
    </aside>
  )
}
