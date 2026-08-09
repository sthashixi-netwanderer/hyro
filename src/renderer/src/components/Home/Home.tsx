import { logger } from '../../utils/logger'
import { useEffect, useState } from 'react'
import type { HomeSection, Track, Album, Playlist, ViewType } from '../../../../shared/types'
import { bestThumbnailUrl } from '../../../../shared/utils'
import { usePlayer } from '../../context/PlayerContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import AddToPlaylistDropdown from '@/components/ui/AddToPlaylistDropdown'
import AlbumFavoriteButton from '@/components/ui/AlbumFavoriteButton'
import PlaylistFavoriteButton from '@/components/ui/PlaylistFavoriteButton'
import ArtistFavoriteButton from '@/components/ui/ArtistFavoriteButton'
import CachedImage from '@/components/ui/CachedImage'
import { Music, Disc3, ListMusic, RefreshCw, User, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HomeProps {
  onNavigate: (type: ViewType, id?: string) => void
}

function getGreetingAndInfo(): { greeting: string; timeStr: string; timeZoneStr: string } {
  const now = new Date()
  const hours = now.getHours()

  let greeting = 'Good Evening'

  if (hours >= 5 && hours < 12) {
    greeting = 'Good Morning'
  } else if (hours >= 12 && hours < 17) {
    greeting = 'Good Afternoon'
  } else if (hours >= 17 && hours < 22) {
    greeting = 'Good Evening'
  } else {
    greeting = 'Good Night'
  }

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  let timeZoneStr = ''
  try {
    const tzMatch = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tzMatch) {
      timeZoneStr = tzMatch.replace('_', ' ')
    }
  } catch {
    // fallback
  }

  return { greeting, timeStr, timeZoneStr }
}

export default function Home({ onNavigate }: HomeProps) {
  const [sections, setSections] = useState<HomeSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeInfo, setTimeInfo] = useState(getGreetingAndInfo())
  const [activeFilter, setActiveFilter] = useState<'all' | 'new-releases' | 'albums' | 'singles'>('all')
  const { playTrack } = usePlayer()

  useEffect(() => {
    loadHomeSections()
    const timer = setInterval(() => {
      setTimeInfo(getGreetingAndInfo())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  async function loadHomeSections() {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getHomeSections()
      setSections(data)

      // Pre-cache all section cover arts locally
      const urls: string[] = []
      for (const section of data) {
        for (const item of section.contents) {
          const url = bestThumbnailUrl(item.thumbnails)
          if (url) urls.push(url)
        }
      }
      if (urls.length > 0) {
        window.api.preCacheImages(urls).catch(() => {})
      }
    } catch (err) {
      setError('Failed to load content. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handlePlayTrack(track: Track, tracks: Track[]) {
    playTrack(track, tracks)
  }

  function getPlaceholderIcon(item: Track | Album | Playlist) {
    if ('videoId' in item) return <Music className="size-8 text-muted-foreground" />
    if ('albumId' in item) return <Disc3 className="size-8 text-muted-foreground" />
    return <ListMusic className="size-8 text-muted-foreground" />
  }

  function renderContentItem(item: Track | Album | Playlist, index: number, tracks: Track[], isNewReleaseSection = false) {
    if ('videoId' in item) {
      return (
        <Card
          key={`${item.videoId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onClick={() => handlePlayTrack(item, tracks)}
        >
          <CardContent className="p-0 relative">
            <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center relative">
              <CachedImage
                src={bestThumbnailUrl(item.thumbnails)}
                alt={item.name}
                className="w-full h-full object-cover"
                fallbackIcon={getPlaceholderIcon(item)}
              />
              {isNewReleaseSection && (
                <Badge variant="default" className="absolute top-2 left-2 bg-primary/90 text-[10px] font-bold tracking-wide uppercase shadow-md">
                  SINGLE
                </Badge>
              )}
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <AddToPlaylistDropdown
                id={item.videoId}
                track={item}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p
                className="text-xs text-muted-foreground truncate hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.artist?.artistId) onNavigate('artist', item.artist.artistId)
                }}
              >
                {item.artist?.name}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if ('albumId' in item) {
      return (
        <Card
          key={`${item.albumId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onDoubleClick={() => onNavigate('album', item.albumId)}
        >
          <CardContent className="p-0 relative">
            <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center relative">
              <CachedImage
                src={bestThumbnailUrl(item.thumbnails)}
                alt={item.name}
                className="w-full h-full object-cover"
                fallbackIcon={getPlaceholderIcon(item)}
              />
              {item.releaseType ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "absolute top-2 left-2 text-[10px] font-bold tracking-wide uppercase shadow-md text-white border-0",
                    item.releaseType === 'Single' && "bg-primary/90",
                    item.releaseType === 'EP' && "bg-amber-500/90",
                    item.releaseType === 'Album' && "bg-emerald-500/90"
                  )}
                >
                  {item.releaseType}
                </Badge>
              ) : isNewReleaseSection ? (
                <Badge variant="secondary" className="absolute top-2 left-2 bg-emerald-500/90 text-white text-[10px] font-bold tracking-wide uppercase shadow-md border-0">
                  ALBUM
                </Badge>
              ) : null}
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <AlbumFavoriteButton
                album={item}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p
                className="text-xs text-muted-foreground truncate hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.artist?.artistId) onNavigate('artist', item.artist.artistId)
                }}
              >
                {item.artist?.name}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if ('playlistId' in item) {
      return (
        <Card
          key={`${item.playlistId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onDoubleClick={() => onNavigate('playlist', item.playlistId)}
        >
          <CardContent className="p-0 relative">
            <div className="w-[180px] h-[180px] bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
              <CachedImage
                src={bestThumbnailUrl(item.thumbnails)}
                alt={item.name}
                className="w-full h-full object-cover"
                fallbackIcon={getPlaceholderIcon(item)}
              />
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <PlaylistFavoriteButton
                playlist={item}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.artist?.artistId ? (
                  <span
                    className="hover:underline cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigate('artist', item.artist!.artistId!)
                    }}
                  >
                    {item.artist?.name || 'Playlist'}
                  </span>
                ) : (
                  item.artist?.name || 'Playlist'
                )}
                {item.videoCount != null && ` \u00B7 ${item.videoCount} songs`}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    if ('artistId' in item && (item as any).type === 'ARTIST') {
      const artistItem = item as any
      return (
        <Card
          key={`${artistItem.artistId}-${index}`}
          className="w-[180px] shrink-0 bg-card hover:bg-accent transition-colors cursor-pointer group border-0 p-0"
          onClick={() => onNavigate('artist', artistItem.artistId)}
        >
          <CardContent className="p-0 relative flex flex-col items-center pt-6 pb-4">
            <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-muted flex items-center justify-center mb-3">
              <CachedImage
                src={bestThumbnailUrl(artistItem.thumbnails)}
                alt={artistItem.name}
                className="w-full h-full object-cover"
                fallbackIcon={<User className="size-8 text-muted-foreground" />}
              />
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArtistFavoriteButton
                id={artistItem.artistId}
                artist={artistItem}
                size="md"
                className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm"
              />
            </div>
            <p className="text-sm font-medium truncate px-3 text-center">{artistItem.name}</p>
            <p className="text-xs text-muted-foreground">Artist</p>
          </CardContent>
        </Card>
      )
    }

    return null
  }

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-48 mb-6" />
        {[1, 2, 3].map((section) => (
          <div key={section} className="mb-8">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((card) => (
                <div key={card} className="shrink-0">
                  <Skeleton className="w-[180px] h-[180px] rounded-xl mb-3" />
                  <Skeleton className="h-4 w-28 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={loadHomeSections}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </div>
    )
  }

  // Filter sections based on active tab
  const filteredSections = sections.filter((section) => {
    const titleLower = section.title.toLowerCase()
    const isNewRel = /new album|new release|latest release|new music/i.test(titleLower)

    if (activeFilter === 'new-releases') return isNewRel
    if (activeFilter === 'albums') return section.contents.some((i) => 'albumId' in i)
    if (activeFilter === 'singles') return section.contents.some((i) => 'videoId' in i)
    return true
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header with Timezone Greeting */}
      <div className="shrink-0 px-8 pt-8 pb-4 bg-background/95 backdrop-blur-md z-20 border-b border-border/10 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight">{timeInfo.greeting}</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <Clock className="size-3 text-primary inline" />
            <span className="font-semibold text-foreground/90">{timeInfo.timeStr}</span>
            {timeInfo.timeZoneStr && (
              <>
                <span>•</span>
                <span className="font-mono text-[11px] text-muted-foreground/80">{timeInfo.timeZoneStr}</span>
              </>
            )}
          </p>
        </div>

        {/* Quick Category Filter Pills */}
        <div className="flex items-center gap-1.5 bg-secondary/30 p-1 rounded-xl border border-white/5">
          {(['all', 'new-releases', 'albums', 'singles'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 capitalize',
                activeFilter === filter
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              {filter === 'new-releases' ? 'New Releases' : filter === 'singles' ? 'Songs & Singles' : filter}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground shrink-0"
          onClick={loadHomeSections}
          title="Refresh"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filteredSections.map((section, sIdx) => {
          const isNewReleaseSection = /new album|new release|latest release|new music/i.test(section.title)
          const tracks = section.contents.filter((item): item is Track => 'videoId' in item)

          return (
            <section key={sIdx} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  {isNewReleaseSection ? (
                    <span className="bg-gradient-to-r from-primary via-emerald-400 to-teal-200 bg-clip-text text-transparent">
                      {section.title}
                    </span>
                  ) : (
                    section.title
                  )}
                </h3>
                {isNewReleaseSection && (
                  <Badge variant="outline" className="border-primary/40 text-primary text-[11px]">
                    Fresh Drops
                  </Badge>
                )}
              </div>
              <div className="section-scroll">
                {section.contents.map((item, idx) =>
                  renderContentItem(item, idx, tracks, isNewReleaseSection)
                )}
              </div>
            </section>
          )
        })}
        {filteredSections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Music className="size-12 mb-4" />
            <p>No content matching "{activeFilter}". Try switching filters!</p>
          </div>
        )}
      </div>
    </div>
  )
}
